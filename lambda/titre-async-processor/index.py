import json
import os
import logging
from datetime import datetime, timedelta
from decimal import Decimal
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
JOBS_TABLE = os.environ.get('JOBS_TABLE', 'demo-thor-jobs')
RESULTS_TABLE = os.environ.get('RESULTS_TABLE', 'demo-thor-results')
RESULTS_BUCKET = os.environ.get('RESULTS_BUCKET', 'demo-thor-results')
SUBSCRIPTIONS_TABLE = os.environ.get('SUBSCRIPTIONS_TABLE', 'thor-subscriptions')
REGION = 'eu-west-3'

# Import AWS after environment setup
import boto3
from botocore.exceptions import ClientError

# AWS clients
dynamodb = boto3.resource('dynamodb', region_name=REGION)
s3_client = boto3.client('s3', region_name=REGION)

# Import and initialize Anthropic client after boto3
import anthropic

if ANTHROPIC_API_KEY:
    claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
else:
    claude_client = None
    logger.warning("ANTHROPIC_API_KEY not set - Claude API calls will fail")


def check_and_consume_titre_credit(user_id):
    """
    Verifie et consomme 1 credit titre pour l'utilisateur.
    Retourne (success, message)
    """
    try:
        subscriptions_table = dynamodb.Table(SUBSCRIPTIONS_TABLE)

        # Recuperer l'abonnement de l'utilisateur
        response = subscriptions_table.get_item(Key={'userId': user_id})

        if 'Item' not in response:
            logger.warning(f"User {user_id} not found in subscriptions table")
            return False, "Aucun abonnement trouve. Veuillez vous abonner sur thorpodcast.link"

        subscription = response['Item']

        # Verifier le statut de l'abonnement
        subscription_status = subscription.get('subscriptionStatus', 'inactive')
        if subscription_status != 'active':
            logger.warning(f"User {user_id} subscription is not active: {subscription_status}")
            return False, "Votre abonnement n'est pas actif. Veuillez renouveler sur thorpodcast.link"

        # Verifier les credits titre restants
        remaining_credits = int(subscription.get('remainingTitreCredits', 0))

        if remaining_credits <= 0:
            logger.warning(f"User {user_id} has no remaining titre credits")
            return False, "Credits titre insuffisants. Veuillez recharger sur thorpodcast.link"

        # Decrementer le compteur de credits
        new_remaining = remaining_credits - 1

        subscriptions_table.update_item(
            Key={'userId': user_id},
            UpdateExpression="SET remainingTitreCredits = :new_credits, updatedAt = :timestamp",
            ExpressionAttributeValues={
                ':new_credits': new_remaining,
                ':timestamp': datetime.utcnow().isoformat()
            }
        )

        logger.info(f"User {user_id} consumed 1 titre credit. Remaining: {new_remaining}")
        return True, f"Credit consomme. Credits titre restants: {new_remaining}"

    except Exception as e:
        logger.error(f"Error checking/consuming titre credit for user {user_id}: {str(e)}")
        return False, f"Erreur lors de la verification des credits: {str(e)}"


def lambda_handler(event, context):
    """
    Traitement asynchrone depuis SQS avec appel API Claude
    Version TITRE avec consommation de credits
    """

    logger.info(f"Processing {len(event['Records'])} messages from SQS")

    for record in event['Records']:
        try:
            # Parse SQS message
            message = json.loads(record['body'])
            job_id = message['job_id']
            user_id = message.get('user_id', 'unknown')

            # Check if this is a regeneration request
            is_regeneration = message.get('is_regeneration', False)
            prompt_adjustment = message.get('prompt_adjustment', '')

            logger.info(f"Processing job {job_id} for user {user_id} (regeneration: {is_regeneration})")

            # Get job details from DynamoDB
            jobs_table = dynamodb.Table(JOBS_TABLE)
            job_response = jobs_table.get_item(Key={'job_id': job_id})

            if 'Item' not in job_response:
                raise Exception(f"Job {job_id} not found in database")

            job = job_response['Item']

            # Recuperer user_id depuis le job si pas dans le message
            if user_id == 'unknown':
                user_id = job.get('user_id', 'unknown')

            # Verifier et consommer 1 credit titre AVANT la generation
            # Ne pas verifier les credits pour les regenerations (deja paye)
            if not is_regeneration:
                credit_success, credit_message = check_and_consume_titre_credit(user_id)
                if not credit_success:
                    logger.error(f"Credit check failed for user {user_id}: {credit_message}")
                    update_job_status(
                        job_id=job_id,
                        status='FAILED',
                        error=credit_message
                    )
                    continue  # Passer au message suivant sans lever d'exception (ne pas retry)

            # Get text from S3
            s3_key = job.get('s3_key')
            if not s3_key:
                raise Exception(f"No S3 key found for job {job_id}")

            # Read text from S3
            uploads_bucket = os.environ.get('UPLOADS_BUCKET', 'demo-thor-uploads')
            try:
                s3_response = s3_client.get_object(Bucket=uploads_bucket, Key=s3_key)
                content = s3_response['Body'].read()

                # Try to decode with multiple encodings
                text = None
                encodings_to_try = ['utf-8', 'iso-8859-1', 'latin-1', 'cp1252', 'windows-1252']

                for encoding in encodings_to_try:
                    try:
                        text = content.decode(encoding)
                        logger.info(f"Successfully decoded file with {encoding} encoding")
                        break
                    except UnicodeDecodeError:
                        continue

                if text is None:
                    # Try with chardet if available
                    try:
                        import chardet
                        detected = chardet.detect(content)
                        if detected['encoding']:
                            text = content.decode(detected['encoding'])
                            logger.info(f"Decoded file with detected encoding: {detected['encoding']}")
                    except:
                        pass

                if text is None:
                    logger.error(f"File {s3_key} could not be decoded with any encoding")

                    # Check if there's a .txt version of the file
                    text_key = s3_key.replace(job.get('file_extension', ''), 'txt')
                    if text_key != s3_key:
                        try:
                            text_response = s3_client.get_object(Bucket=uploads_bucket, Key=text_key)
                            text = text_response['Body'].read().decode('utf-8')
                            logger.info(f"Found extracted text file: {text_key}")
                        except:
                            raise Exception(f"Failed to read extracted text for binary file {s3_key}")
                    else:
                        raise Exception(f"Cannot process binary file {s3_key} - text extraction failed")

            except Exception as e:
                logger.error(f"Failed to read file from S3: {str(e)}")
                raise Exception(f"Failed to read file from S3: {str(e)}")

            # Update job status to PROCESSING
            update_job_status(job_id, 'PROCESSING')

            # Generate summary with Claude (with feedback if regeneration)
            if is_regeneration:
                previous_result = job.get('result', {})
                summary_result = generate_summary_with_retry(
                    text=text,
                    file_name=job.get('file_name', 'unknown.txt'),
                    file_extension=job.get('file_extension', 'txt'),
                    prompt_adjustment=prompt_adjustment,
                    previous_result=previous_result
                )
            else:
                summary_result = generate_summary_with_retry(
                    text=text,
                    file_name=job.get('file_name', 'unknown.txt'),
                    file_extension=job.get('file_extension', 'txt')
                )

            if summary_result['success']:
                # Save result to S3
                s3_key = save_result_to_s3(
                    job_id=job_id,
                    user_group=job.get('user_group', 'unknown'),
                    user_id=job.get('user_id', 'unknown'),
                    summary=summary_result['summary']
                )

                # Save result to DynamoDB
                save_result_to_dynamodb(
                    job_id=job_id,
                    user_id=job.get('user_id', 'unknown'),
                    user_group=job.get('user_group', 'unknown'),
                    summary=summary_result['summary'],
                    s3_key=s3_key
                )

                # Update job status to COMPLETED
                update_job_status(
                    job_id=job_id,
                    status='COMPLETED',
                    result=summary_result['summary']
                )

                logger.info(f"Job {job_id} completed successfully")

            else:
                # Handle failure
                error_message = summary_result.get('error', 'Erreur inconnue lors de la generation')
                logger.error(f"Failed to generate summary for job {job_id}: {error_message}")

                update_job_status(
                    job_id=job_id,
                    status='FAILED',
                    error=error_message
                )

                # If rate limit error, throw to trigger retry
                if 'rate_limit' in error_message.lower():
                    raise Exception(f"Rate limit error: {error_message}")

        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")

            # Update job status if we have job_id
            if 'job_id' in locals():
                update_job_status(
                    job_id=job_id,
                    status='FAILED',
                    error=str(e)
                )

            # Re-raise for SQS retry if it's a temporary error
            if 'rate_limit' in str(e).lower() or 'timeout' in str(e).lower():
                raise

    return {'statusCode': 200, 'body': json.dumps('Processing complete')}


def generate_summary_with_retry(text, file_name, file_extension, prompt_adjustment=None, previous_result=None, max_retries=3):
    """
    Appel Claude API avec retry logic et prompt identique a v1
    """

    if not claude_client:
        return {
            'success': False,
            'error': 'API Claude non configuree'
        }

    # Prepare the prompt (with feedback adjustment if provided)
    if prompt_adjustment:
        previous_title = previous_result.get('titre', '') if previous_result else ''
        previous_summary = previous_result.get('resume', '') if previous_result else ''

        prompt = f"""RESULTAT PRECEDENT :
TITRE : {previous_title}
RESUME : {previous_summary}

FEEDBACK UTILISATEUR : {prompt_adjustment}

ANALYSE DU FEEDBACK :
1. Si le feedback contient les mots "titre", "accrocheur", "percutant", "trop long" -> Modifier PRINCIPALEMENT le titre
2. Si le feedback contient les mots "resume", "description", "contenu" -> Modifier PRINCIPALEMENT le resume
3. Identifier CE QUI DOIT CHANGER :
   - "pas assez accrocheur" = titre plus percutant, avec punch, interpellant
   - "trop long" = raccourcir significativement
   - "trop court" = developper davantage
   - "manque de dynamisme" = utiliser des verbes d'action, ton plus energique

REGLE ABSOLUE :
- Le nouveau titre DOIT etre SUBSTANTIELLEMENT DIFFERENT de l'ancien (pas juste 1-2 mots changes)
- Si le feedback parle du titre, le titre DOIT changer d'au moins 70%
- Garder le resume identique si le feedback ne le mentionne pas

OBJECTIF :
- Generer un NOUVEAU titre DIFFERENT et plus attractif en tenant compte du feedback
- Rediger un resume de 5 a 6 lignes presentant le sujet principal, les invites et les points cles de facon engageante

CONTENU DU RESUME :
- Angle attractif sur le sujet principal
- Noms et fonctions des invites principaux
- Points cles les plus importants de l'emission
- Une phrase finale soulignant l'interet pour l'auditeur

STYLE :
- Ton informatif et vivant, comme un article de presse de qualite
- Phrases courtes et percutantes
- Style engageant sans superlatifs
- Vocabulaire accessible et varie
- Focus sur l'essentiel et les enjeux cles

FORMAT OBLIGATOIRE :
TITRE : [nouveau titre COMPLETEMENT DIFFERENT du precedent - ne pas reutiliser les memes mots principaux]
RESUME : [resume - garder le precedent si le feedback ne demande pas de le changer]

CONSIGNE : Utiliser uniquement les infos du conducteur fourni. Donner envie d'ecouter en restant concis.

Fichier: {file_name} (format: {file_extension})

CONDUCTEUR :
{text[:30000]}"""
    else:
        # Prompt normal sans feedback
        prompt = f"""OBJECTIF :
- Generer un titre attractif pour l'episode
- Rediger un resume de 5 a 6 lignes presentant le sujet principal, les invites et les points cles de facon engageante

CONTENU DU RESUME :
- Angle attractif sur le sujet principal
- Noms et fonctions des invites principaux
- Points cles les plus importants de l'emission
- Une phrase finale soulignant l'interet pour l'auditeur

STYLE :
- Ton informatif et vivant, comme un article de presse de qualite
- Phrases courtes et percutantes
- Style engageant sans superlatifs
- Vocabulaire accessible et varie
- Focus sur l'essentiel et les enjeux cles

FORMAT OBLIGATOIRE :
TITRE : [titre genere]
RESUME : [resume genere de 5 a 6 lignes maximum]

CONSIGNE : Utiliser uniquement les infos du conducteur fourni. Donner envie d'ecouter en restant concis.

Fichier: {file_name} (format: {file_extension})

CONDUCTEUR :
{text[:30000]}"""

    for attempt in range(max_retries):
        try:
            logger.info(f"Calling Claude API (attempt {attempt + 1}/{max_retries})")

            # Call Claude API
            response = claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                temperature=0.3,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            # Extract response text
            response_text = response.content[0].text if response.content else ""

            logger.info(f"Claude API response received: {len(response_text)} characters")

            # Parse the response to extract title and summary
            parsed_result = parse_claude_response(response_text)

            return {
                'success': True,
                'summary': parsed_result
            }

        except anthropic.RateLimitError as e:
            logger.warning(f"Rate limit error (attempt {attempt + 1}): {str(e)}")
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
            else:
                return {
                    'success': False,
                    'error': f'Rate limit depasse apres {max_retries} tentatives'
                }

        except anthropic.APIError as e:
            logger.error(f"Claude API error: {str(e)}")
            if 'overloaded' in str(e).lower() or '529' in str(e):
                return {
                    'success': False,
                    'error': 'IA temporairement surchargee. Merci de reessayer dans quelques instants.'
                }
            return {
                'success': False,
                'error': f'Erreur API Claude: {str(e)}'
            }

        except Exception as e:
            logger.error(f"Unexpected error calling Claude: {str(e)}")
            return {
                'success': False,
                'error': f'Erreur inattendue: {str(e)}'
            }

    return {
        'success': False,
        'error': 'Echec apres toutes les tentatives'
    }


def parse_claude_response(response_text):
    """
    Parse Claude response to extract title and summary
    """
    result = {
        'titre': '',
        'resume': '',
        'raw_response': response_text
    }

    try:
        # Try to extract TITRE (with or without # prefix)
        titre_patterns = ['# TITRE :', 'TITRE :', '# Titre :', 'Titre :']
        for pattern in titre_patterns:
            if pattern in response_text:
                titre_start = response_text.index(pattern) + len(pattern)
                titre_end = response_text.find('\n', titre_start)
                if titre_end == -1:
                    titre_end = len(response_text)
                result['titre'] = response_text[titre_start:titre_end].strip()
                break

        # Try to extract RESUME (with or without # prefix)
        resume_patterns = ['# RESUME :', 'RESUME :', '# Resume :', 'Resume :', '# RÉSUMÉ :', 'RÉSUMÉ :']
        for pattern in resume_patterns:
            if pattern in response_text:
                resume_start = response_text.index(pattern) + len(pattern)
                result['resume'] = response_text[resume_start:].strip()
                break

        # Clean up the results
        result['titre'] = result['titre'].replace('[', '').replace(']', '').replace('**', '').replace('*', '').strip()
        result['resume'] = result['resume'].replace('[', '').replace(']', '').replace('**', '').replace('*', '').strip()

        # If parsing failed, use the whole response
        if not result['titre'] and not result['resume']:
            lines = response_text.strip().split('\n')
            if lines:
                result['titre'] = lines[0][:100]
                if len(lines) > 1:
                    result['resume'] = '\n'.join(lines[1:])
                else:
                    result['resume'] = response_text

    except Exception as e:
        logger.error(f"Error parsing Claude response: {str(e)}")
        result['titre'] = "Resume genere"
        result['resume'] = response_text

    return result


def update_job_status(job_id, status, result=None, error=None):
    """
    Update job status in DynamoDB
    """
    try:
        table = dynamodb.Table(JOBS_TABLE)

        update_expr = "SET #status = :status, updated_at = :timestamp"
        expr_values = {
            ':status': status,
            ':timestamp': datetime.utcnow().isoformat()
        }
        expr_names = {'#status': 'status'}

        if result:
            update_expr += ", #result = :result"
            expr_values[':result'] = result
            expr_names['#result'] = 'result'

        if error:
            update_expr += ", error_message = :error"
            expr_values[':error'] = error

        table.update_item(
            Key={'job_id': job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )

        logger.info(f"Updated job {job_id} status to {status}")

    except Exception as e:
        logger.error(f"Error updating job status: {str(e)}")


def save_result_to_s3(job_id, user_group, user_id, summary):
    """
    Save result to S3
    """
    try:
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        s3_key = f"{user_group}/{user_id}/{job_id}/result_{timestamp}.json"

        s3_client.put_object(
            Bucket=RESULTS_BUCKET,
            Key=s3_key,
            Body=json.dumps(summary, ensure_ascii=False),
            ContentType='application/json'
        )

        logger.info(f"Result saved to S3: {s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Error saving to S3: {str(e)}")
        return None


def save_result_to_dynamodb(job_id, user_id, user_group, summary, s3_key):
    """
    Save result to DynamoDB with TTL
    """
    try:
        table = dynamodb.Table(RESULTS_TABLE)

        # Calculate TTL (30 days)
        ttl = int((datetime.utcnow() + timedelta(days=30)).timestamp())

        table.put_item(
            Item={
                'job_id': job_id,
                'user_id': user_id,
                'user_group': user_group,
                'summary': summary,
                's3_key': s3_key,
                'created_at': datetime.utcnow().isoformat(),
                'ttl': ttl
            }
        )

        logger.info(f"Result saved to DynamoDB for job {job_id}")

    except Exception as e:
        logger.error(f"Error saving to DynamoDB: {str(e)}")
