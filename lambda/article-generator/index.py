import json
import os
import logging
from datetime import datetime, timedelta
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
JOBS_TABLE = os.environ.get('JOBS_TABLE', 'thor-web-jobs')
RESULTS_TABLE = os.environ.get('RESULTS_TABLE', 'thor-web-results')
RESULTS_BUCKET = os.environ.get('RESULTS_BUCKET', 'thor-web-storage')
REGION = 'eu-west-3'

# Import AWS after environment setup
import boto3
from botocore.exceptions import ClientError

# AWS clients
dynamodb = boto3.resource('dynamodb', region_name=REGION)
s3_client = boto3.client('s3', region_name=REGION)

# Import and initialize Anthropic client
import anthropic

if ANTHROPIC_API_KEY:
    claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
else:
    claude_client = None
    logger.warning("ANTHROPIC_API_KEY not set - Claude API calls will fail")


def lambda_handler(event, context):
    """
    Article Generator - Traitement SQS avec appel API Claude
    Inspiré de Thor KTO V2 async-processor
    """

    logger.info(f"Processing {len(event['Records'])} messages from SQS")

    for record in event['Records']:
        try:
            # Parse SQS message
            message = json.loads(record['body'])
            job_id = message['job_id']
            user_id = message['user_id']
            transcript_text = message['transcript_text']

            logger.info(f"Processing job {job_id}")

            # Get job details from DynamoDB
            jobs_table = dynamodb.Table(JOBS_TABLE)
            job_response = jobs_table.get_item(Key={'job_id': job_id})

            if 'Item' not in job_response:
                raise Exception(f"Job {job_id} not found in database")

            job = job_response['Item']

            # Update job status to GENERATING
            update_job_status(job_id, 'GENERATING')

            # Generate article with Claude
            article_result = generate_article_with_retry(
                transcript_text=transcript_text,
                file_name=job.get('file_name', 'audio.mp3'),
                max_retries=3
            )

            if article_result['success']:
                # Save result to S3
                s3_key = save_result_to_s3(
                    job_id=job_id,
                    user_id=user_id,
                    article=article_result['article']
                )

                # Save result to DynamoDB
                save_result_to_dynamodb(
                    job_id=job_id,
                    user_id=user_id,
                    article=article_result['article'],
                    s3_key=s3_key
                )

                # Update job status to COMPLETED
                update_job_status(
                    job_id=job_id,
                    status='COMPLETED',
                    result=article_result['article']
                )

                logger.info(f"Job {job_id} completed successfully")

            else:
                # Handle failure
                error_message = article_result.get('error', 'Unknown error during article generation')
                logger.error(f"Failed to generate article for job {job_id}: {error_message}")

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


def generate_article_with_retry(transcript_text, file_name, max_retries=3):
    """
    Call Claude API with retry logic to generate web article
    Inspiré de Thor KTO V2
    """

    if not claude_client:
        return {
            'success': False,
            'error': 'API Claude non configurée'
        }

    # Prompt détaillé pour générer un article de qualité
    prompt = f"""RÔLE

Vous êtes rédacteur de contenu pour une radio locale, spécialisé dans la création de textes indiscernables de ceux rédigés par des humains. Votre expertise réside dans la capture des nuances émotionnelles, de la pertinence culturelle et de l'authenticité contextuelle, garantissant un contenu qui résonne naturellement auprès de n'importe quel public.

OBJECTIF

Vous allez maintenant rédiger un article basé sur la transcription audio fournie ci-dessous.

TYPE D'ARTICLE : Article d'actualité à partir du podcast d'une émission radio

PUBLIC CIBLE : CSP+ 30/60 ans

NOMBRE DE MOTS : 1500

Votre contenu doit être engageant, captivant et convaincant, avec une fluidité logique, des transitions naturelles et un ton spontané. L'objectif est de trouver un équilibre entre précision technique et proximité émotionnelle. Si vous faites une citation pensez à donner le prénom et le nom et pas uniquement le nom de famille.

EXIGENCES

• Maintenir un score de facilité de lecture Flesch autour de 80.
• Utiliser un ton conversationnel et engageant.
• Ajouter des digressions naturelles sur des sujets connexes pertinents.
• Mixer jargon professionnel et explications informelles.
• Intégrer des indices émotionnels subtils et des questions rhétoriques.
• Utiliser des contractions, idiomes et expressions familières pour un ton informel et dynamique.
• Varier la longueur et la structure des phrases : alterner phrases courtes et percutantes avec des phrases plus complexes.
• Structurer les phrases pour renforcer la clarté et la fluidité.
• Garantir une cohérence logique et un rythme dynamique entre les paragraphes.
• Enrichir le texte avec un vocabulaire varié et des choix de mots inattendus.
• Éviter les adverbes excessifs.
• Inclure des répétitions légères pour insister sur des idées importantes, sans tomber dans des schémas mécaniques.
• Utiliser des sous-titres accrocheurs et naturels, dans un ton conversationnel.
• Connecter les sections avec des phrases de transition pour une continuité fluide.

DIRECTIVES D'AMÉLIORATION DU CONTENU

• Introduire des questions rhétoriques, indices émotionnels et expressions décontractées lorsque cela améliore la lisibilité.
• Pour un public professionnel, rester subtil mais relatable ; pour un public général, adopter une approche plus chaleureuse et connectée.
• Intégrer des détails sensoriels seulement si cela améliore la clarté ou l'intérêt du texte.
• Éviter certains mots : optez, plonger, débloquer, libérer, complexe, utilisation, transformation, alignement, proactif, évolutif, benchmark.
• Éviter certaines expressions : "Dans ce monde," "dans le monde d'aujourd'hui," "à la fin de la journée," "être sur la même longueur d'onde," "de bout en bout," "afin de," "meilleures pratiques".
• Imiter les imperfections humaines comme des formulations légèrement informelles ou des transitions inattendues.
• Viser une grande perplexité (vocabulaire varié et structures de phrases diversifiées) et éclat (mélange de phrases courtes et longues).

ÉLÉMENTS STRUCTURELS

• Varier les longueurs des paragraphes (de 1 à 7 phrases).
• Utiliser des listes à puces avec parcimonie et naturel.
• Intégrer des sous-titres conversationnels.
• Mélanger langage formel et informel de manière fluide.
• Préférer la voix active, tout en équilibrant avec un peu de voix passive.
• Inclure des contradictions légères, suivies d'explications.
• Créer un plan ou une structure de base avant de rédiger pour assurer la cohérence et le flux logique.

FORMAT DE SORTIE OBLIGATOIRE :

TITRE : [Un titre accrocheur et informatif]
INTRODUCTION : [2-3 phrases d'accroche pour captiver le lecteur]
ARTICLE : [Le corps de l'article structuré avec des sous-titres naturels]
CONCLUSION : [Une phrase finale impactante]

---

Fichier audio source : {file_name}

TRANSCRIPTION DE L'ÉMISSION RADIO :
{transcript_text[:50000]}

---

Rédigez maintenant l'article en suivant toutes les directives ci-dessus."""

    for attempt in range(max_retries):
        try:
            logger.info(f"Calling Claude API (attempt {attempt + 1}/{max_retries})")

            # Call Claude API
            response = claude_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4000,
                temperature=0.7,
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

            # Parse the response to extract article components
            parsed_result = parse_claude_response(response_text)

            return {
                'success': True,
                'article': parsed_result
            }

        except anthropic.RateLimitError as e:
            logger.warning(f"Rate limit error (attempt {attempt + 1}): {str(e)}")
            if attempt < max_retries - 1:
                # Exponential backoff
                wait_time = 2 ** attempt
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
            else:
                return {
                    'success': False,
                    'error': f'Rate limit dépassé après {max_retries} tentatives'
                }

        except anthropic.APIError as e:
            logger.error(f"Claude API error: {str(e)}")
            if 'overloaded' in str(e).lower() or '529' in str(e):
                return {
                    'success': False,
                    'error': 'IA temporairement surchargée. Merci de réessayer dans quelques instants.'
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
        'error': 'Échec après toutes les tentatives'
    }


def parse_claude_response(response_text):
    """
    Parse Claude response to extract article components
    Format attendu:
    TITRE: [titre]
    INTRODUCTION: [intro]
    ARTICLE: [contenu]
    CONCLUSION: [conclusion]
    """
    result = {
        'titre': '',
        'introduction': '',
        'article': '',
        'conclusion': '',
        'raw_response': response_text
    }

    try:
        # Extract TITRE
        if 'TITRE:' in response_text or 'TITRE :' in response_text:
            titre_start = response_text.find('TITRE')
            titre_start = response_text.find(':', titre_start) + 1
            titre_end = response_text.find('\n', titre_start)
            if titre_end == -1:
                titre_end = len(response_text)
            result['titre'] = response_text[titre_start:titre_end].strip()

        # Extract INTRODUCTION
        if 'INTRODUCTION:' in response_text or 'INTRODUCTION :' in response_text:
            intro_start = response_text.find('INTRODUCTION')
            intro_start = response_text.find(':', intro_start) + 1
            intro_end = response_text.find('ARTICLE', intro_start)
            if intro_end == -1:
                intro_end = response_text.find('\n\n', intro_start)
            if intro_end != -1:
                result['introduction'] = response_text[intro_start:intro_end].strip()

        # Extract ARTICLE
        if 'ARTICLE:' in response_text or 'ARTICLE :' in response_text:
            article_start = response_text.find('ARTICLE')
            article_start = response_text.find(':', article_start) + 1
            article_end = response_text.find('CONCLUSION', article_start)
            if article_end == -1:
                article_end = len(response_text)
            result['article'] = response_text[article_start:article_end].strip()

        # Extract CONCLUSION
        if 'CONCLUSION:' in response_text or 'CONCLUSION :' in response_text:
            conclusion_start = response_text.find('CONCLUSION')
            conclusion_start = response_text.find(':', conclusion_start) + 1
            result['conclusion'] = response_text[conclusion_start:].strip()

        # Clean up - remove markdown formatting
        for key in ['titre', 'introduction', 'article', 'conclusion']:
            result[key] = result[key].replace('**', '').replace('*', '').strip()

        # If parsing failed, use whole response as article
        if not result['titre'] and not result['article']:
            result['article'] = response_text
            result['titre'] = 'Article généré'

    except Exception as e:
        logger.error(f"Error parsing Claude response: {str(e)}")
        result['titre'] = "Article généré"
        result['article'] = response_text

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

        if status == 'COMPLETED':
            update_expr += ", completed_at = :completed"
            expr_values[':completed'] = datetime.utcnow().isoformat()

        table.update_item(
            Key={'job_id': job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )

        logger.info(f"Updated job {job_id} status to {status}")

    except Exception as e:
        logger.error(f"Error updating job status: {str(e)}")


def save_result_to_s3(job_id, user_id, article):
    """
    Save article result to S3
    """
    try:
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        s3_key = f"{user_id}/articles/{job_id}/article_{timestamp}.json"

        s3_client.put_object(
            Bucket=RESULTS_BUCKET,
            Key=s3_key,
            Body=json.dumps(article, ensure_ascii=False),
            ContentType='application/json; charset=utf-8'
        )

        logger.info(f"Article saved to S3: {s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Error saving to S3: {str(e)}")
        return None


def save_result_to_dynamodb(job_id, user_id, article, s3_key):
    """
    Save article result to DynamoDB with TTL (30 days)
    """
    try:
        table = dynamodb.Table(RESULTS_TABLE)

        # Calculate TTL (30 days)
        ttl = int((datetime.utcnow() + timedelta(days=30)).timestamp())

        table.put_item(
            Item={
                'job_id': job_id,
                'user_id': user_id,
                'article': article,
                's3_key': s3_key,
                'created_at': datetime.utcnow().isoformat(),
                'ttl': ttl
            }
        )

        logger.info(f"Article result saved to DynamoDB for job {job_id}")

    except Exception as e:
        logger.error(f"Error saving to DynamoDB: {str(e)}")
