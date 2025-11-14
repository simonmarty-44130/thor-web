# THOR WEB - Guide de Démarrage Rapide

Ce guide vous aide à déployer THOR WEB de zéro.

---

## ✅ Checklist de Déploiement

### 1️⃣ Prérequis (à faire en premier)

- [ ] Compte AWS avec accès administrateur
- [ ] AWS CLI installé et configuré
- [ ] Node.js 18+ installé
- [ ] Python 3.11+ installé
- [ ] Compte Anthropic avec clé API Claude

---

### 2️⃣ Créer les Tables DynamoDB

```bash
# Table thor-web-jobs
aws dynamodb create-table \
  --table-name thor-web-jobs \
  --attribute-definitions \
    AttributeName=job_id,AttributeType=S \
    AttributeName=user_id,AttributeType=S \
    AttributeName=timestamp,AttributeType=N \
  --key-schema \
    AttributeName=job_id,KeyType=HASH \
  --global-secondary-indexes \
    "[{
      \"IndexName\": \"UserJobsIndex\",
      \"KeySchema\": [{\"AttributeName\":\"user_id\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"timestamp\",\"KeyType\":\"RANGE\"}],
      \"Projection\":{\"ProjectionType\":\"ALL\"}
    }]" \
  --billing-mode PAY_PER_REQUEST \
  --region eu-west-3

# Table thor-web-results (avec TTL)
aws dynamodb create-table \
  --table-name thor-web-results \
  --attribute-definitions \
    AttributeName=job_id,AttributeType=S \
  --key-schema \
    AttributeName=job_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-west-3

# Activer TTL sur thor-web-results
aws dynamodb update-time-to-live \
  --table-name thor-web-results \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --region eu-west-3
```

---

### 3️⃣ Créer les Buckets S3

```bash
# Bucket pour les fichiers
aws s3 mb s3://thor-web-storage --region eu-west-3

# Bucket pour le frontend (static website)
aws s3 mb s3://thor-web-frontend --region eu-west-3

# Configurer le bucket frontend en static website
aws s3 website s3://thor-web-frontend \
  --index-document index.html \
  --error-document index.html

# Bucket policy pour le frontend (public read)
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::thor-web-frontend/*"
  }]
}
EOF

aws s3api put-bucket-policy \
  --bucket thor-web-frontend \
  --policy file:///tmp/bucket-policy.json
```

---

### 4️⃣ Créer les SQS Queues

```bash
# Dead Letter Queue
aws sqs create-queue \
  --queue-name thor-web-article-queue-dlq \
  --region eu-west-3

# Main Queue (avec DLQ)
aws sqs create-queue \
  --queue-name thor-web-article-queue \
  --attributes '{
    "VisibilityTimeout": "300",
    "MessageRetentionPeriod": "1209600",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:eu-west-3:ACCOUNT_ID:thor-web-article-queue-dlq\",\"maxReceiveCount\":\"3\"}"
  }' \
  --region eu-west-3
```

⚠️ Remplacer `ACCOUNT_ID` par votre AWS Account ID

---

### 5️⃣ Créer le rôle IAM pour les Lambdas

```bash
# 1. Trust policy
cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

# 2. Créer le rôle
aws iam create-role \
  --role-name thor-web-lambda-role \
  --assume-role-policy-document file:///tmp/trust-policy.json

# 3. Attacher la policy pour CloudWatch Logs
aws iam attach-role-policy \
  --role-name thor-web-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# 4. Créer une inline policy pour les autres permissions
# Voir docs/AWS_RESOURCES.md pour la policy complète
```

---

### 6️⃣ Stocker la clé API Anthropic dans Secrets Manager

```bash
aws secretsmanager create-secret \
  --name thor-web/anthropic-api-key \
  --secret-string '{"api_key":"sk-ant-api03-VOTRE_CLE_ICI"}' \
  --region eu-west-3
```

---

### 7️⃣ Créer les Lambda Functions

#### upload-handler

```bash
cd /Users/directionradiofidelite/thor-web/lambda/upload-handler
npm install
zip -r /tmp/upload-handler.zip .

aws lambda create-function \
  --function-name thor-web-upload-handler \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT_ID:role/thor-web-lambda-role \
  --handler index.handler \
  --zip-file fileb:///tmp/upload-handler.zip \
  --timeout 60 \
  --memory-size 512 \
  --environment Variables={JOBS_TABLE=thor-web-jobs,STORAGE_BUCKET=thor-web-storage,AWS_REGION=eu-west-3} \
  --region eu-west-3
```

#### transcription-complete

```bash
cd /Users/directionradiofidelite/thor-web/lambda/transcription-complete
npm install
zip -r /tmp/transcription-complete.zip .

aws lambda create-function \
  --function-name thor-web-transcription-complete \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT_ID:role/thor-web-lambda-role \
  --handler index.handler \
  --zip-file fileb:///tmp/transcription-complete.zip \
  --timeout 60 \
  --memory-size 256 \
  --environment Variables={JOBS_TABLE=thor-web-jobs,STORAGE_BUCKET=thor-web-storage,ARTICLE_QUEUE_URL=https://sqs.eu-west-3.amazonaws.com/ACCOUNT_ID/thor-web-article-queue} \
  --region eu-west-3
```

#### article-generator

```bash
cd /Users/directionradiofidelite/thor-web/lambda/article-generator
pip3 install -r requirements.txt -t .
zip -r /tmp/article-generator.zip .

aws lambda create-function \
  --function-name thor-web-article-generator \
  --runtime python3.11 \
  --role arn:aws:iam::ACCOUNT_ID:role/thor-web-lambda-role \
  --handler index.lambda_handler \
  --zip-file fileb:///tmp/article-generator.zip \
  --timeout 300 \
  --memory-size 1024 \
  --environment Variables={JOBS_TABLE=thor-web-jobs,RESULTS_TABLE=thor-web-results,RESULTS_BUCKET=thor-web-storage,AWS_REGION=eu-west-3} \
  --region eu-west-3

# Ajouter la clé API depuis Secrets Manager
aws lambda update-function-configuration \
  --function-name thor-web-article-generator \
  --environment Variables={ANTHROPIC_API_KEY=VOTRE_CLE_API,JOBS_TABLE=thor-web-jobs,RESULTS_TABLE=thor-web-results,RESULTS_BUCKET=thor-web-storage,AWS_REGION=eu-west-3} \
  --region eu-west-3
```

⚠️ **IMPORTANT** : Remplacer `ACCOUNT_ID` et `VOTRE_CLE_API`

---

### 8️⃣ Créer l'EventBridge Rule

```bash
# 1. Créer la règle
aws events put-rule \
  --name thor-web-transcription-complete \
  --event-pattern '{
    "source": ["aws.transcribe"],
    "detail-type": ["Transcribe Job State Change"],
    "detail": {
      "TranscriptionJobName": [{"prefix": "thor-web-"}]
    }
  }' \
  --region eu-west-3

# 2. Donner la permission à EventBridge d'invoquer la Lambda
aws lambda add-permission \
  --function-name thor-web-transcription-complete \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:eu-west-3:ACCOUNT_ID:rule/thor-web-transcription-complete \
  --region eu-west-3

# 3. Ajouter la Lambda comme target
aws events put-targets \
  --rule thor-web-transcription-complete \
  --targets "Id"="1","Arn"="arn:aws:lambda:eu-west-3:ACCOUNT_ID:function:thor-web-transcription-complete" \
  --region eu-west-3
```

---

### 9️⃣ Connecter SQS à article-generator Lambda

```bash
# Créer un event source mapping
aws lambda create-event-source-mapping \
  --function-name thor-web-article-generator \
  --event-source-arn arn:aws:sqs:eu-west-3:ACCOUNT_ID:thor-web-article-queue \
  --batch-size 1 \
  --region eu-west-3
```

---

### 🔟 Créer Cognito User Pool

```bash
# 1. Créer le User Pool
aws cognito-idp create-user-pool \
  --pool-name thor-web-users \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  }' \
  --auto-verified-attributes email \
  --region eu-west-3

# Récupérer le User Pool ID
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 20 --region eu-west-3 --query "UserPools[?Name=='thor-web-users'].Id" --output text)

# 2. Créer l'App Client
aws cognito-idp create-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-name thor-web-client \
  --allowed-o-auth-flows implicit \
  --allowed-o-auth-scopes openid email profile \
  --callback-urls http://localhost:3000 https://your-domain.com \
  --supported-identity-providers COGNITO \
  --region eu-west-3

# 3. Créer un domaine Cognito
aws cognito-idp create-user-pool-domain \
  --user-pool-id $USER_POOL_ID \
  --domain thor-web-auth \
  --region eu-west-3
```

---

### 1️⃣1️⃣ Créer API Gateway

Créer manuellement dans la console AWS :

1. **Type** : REST API
2. **Endpoint** : Regional
3. **Resources** :
   - POST /upload → thor-web-upload-handler
   - GET /jobs → (à créer)
   - GET /jobs/{jobId} → (à créer)

4. **Authorizer** : Cognito User Pool

5. **CORS** : Activer

6. **Deploy** : Stage `prod`

---

### 1️⃣2️⃣ Configurer et Déployer le Frontend

```bash
# 1. Mettre à jour la config
cd /Users/directionradiofidelite/thor-web/frontend/src/config

# Éditer index.ts avec les vraies valeurs :
# - API_ENDPOINT
# - COGNITO_USER_POOL_ID
# - COGNITO_CLIENT_ID

# 2. Build
cd /Users/directionradiofidelite/thor-web/frontend
npm install
npm run build

# 3. Deploy vers S3
aws s3 sync build/ s3://thor-web-frontend/ --delete --region eu-west-3

# 4. URL du site
echo "http://thor-web-frontend.s3-website.eu-west-3.amazonaws.com"
```

---

## 🎯 Tester l'Application

1. **Accéder au frontend** : http://thor-web-frontend.s3-website.eu-west-3.amazonaws.com
2. **Se connecter** via Cognito
3. **Uploader un MP3**
4. **Attendre** la transcription et génération
5. **Voir l'article** généré

---

## 📝 Dernière Étape : Configurer le Prompt Claude

**IMPORTANT** : Mettre à jour le prompt dans `lambda/article-generator/index.py:153`

Puis redéployer :
```bash
cd /Users/directionradiofidelite/thor-web/scripts
./deploy-lambdas.sh
```

---

## ✅ Checklist Finale

- [ ] DynamoDB tables créées
- [ ] S3 buckets créés
- [ ] SQS queues créées
- [ ] IAM role créé
- [ ] Secrets Manager configuré
- [ ] 3 Lambdas déployées
- [ ] EventBridge rule créée
- [ ] SQS → Lambda mapping créé
- [ ] Cognito User Pool créé
- [ ] API Gateway configuré
- [ ] Frontend déployé
- [ ] **Prompt Claude configuré**

---

## 🐛 En cas de problème

1. Vérifier les logs CloudWatch de chaque Lambda
2. Vérifier les permissions IAM
3. Vérifier que toutes les ressources sont dans `eu-west-3`
4. Vérifier que les variables d'environnement sont correctes

---

**Temps estimé pour le déploiement complet** : 1-2 heures
