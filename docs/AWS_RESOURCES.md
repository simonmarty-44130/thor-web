# THOR WEB - Ressources AWS Nécessaires

## 📋 Vue d'ensemble

Ce document liste toutes les ressources AWS à créer pour déployer THOR WEB.

---

## 🗄️ DynamoDB Tables

### 1. thor-web-jobs
Table principale pour stocker les jobs de transcription/génération.

```json
{
  "TableName": "thor-web-jobs",
  "KeySchema": [
    {
      "AttributeName": "job_id",
      "KeyType": "HASH"
    }
  ],
  "AttributeDefinitions": [
    {
      "AttributeName": "job_id",
      "AttributeType": "S"
    },
    {
      "AttributeName": "user_id",
      "AttributeType": "S"
    },
    {
      "AttributeName": "timestamp",
      "AttributeType": "N"
    }
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "UserJobsIndex",
      "KeySchema": [
        {
          "AttributeName": "user_id",
          "KeyType": "HASH"
        },
        {
          "AttributeName": "timestamp",
          "KeyType": "RANGE"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
```

### 2. thor-web-results
Table pour stocker les résultats d'articles générés (avec TTL 30 jours).

```json
{
  "TableName": "thor-web-results",
  "KeySchema": [
    {
      "AttributeName": "job_id",
      "KeyType": "HASH"
    }
  ],
  "AttributeDefinitions": [
    {
      "AttributeName": "job_id",
      "AttributeType": "S"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "TimeToLiveSpecification": {
    "Enabled": true,
    "AttributeName": "ttl"
  }
}
```

---

## 🪣 S3 Buckets

### 1. thor-web-storage
Bucket pour stocker les MP3 uploadés, transcriptions, et articles.

- **Name**: `thor-web-storage`
- **Region**: `eu-west-3`
- **Versioning**: Enabled
- **Encryption**: AES-256
- **Lifecycle Rules**:
  - Expiration: 90 days

### 2. thor-web-frontend
Bucket pour héberger le frontend React (static website).

- **Name**: `thor-web-frontend`
- **Region**: `eu-west-3`
- **Static Website Hosting**: Enabled
- **Index Document**: `index.html`
- **Error Document**: `index.html`
- **Bucket Policy**: Public read access

---

## 📨 SQS Queue

### thor-web-article-queue
Queue pour traiter les jobs de génération d'articles.

```json
{
  "QueueName": "thor-web-article-queue",
  "DelaySeconds": 0,
  "MaximumMessageSize": 262144,
  "MessageRetentionPeriod": 1209600,
  "ReceiveMessageWaitTimeSeconds": 0,
  "VisibilityTimeout": 300,
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:eu-west-3:ACCOUNT_ID:thor-web-article-queue-dlq",
    "maxReceiveCount": 3
  }
}
```

### thor-web-article-queue-dlq (Dead Letter Queue)
```json
{
  "QueueName": "thor-web-article-queue-dlq",
  "MessageRetentionPeriod": 1209600
}
```

---

## ⚡ Lambda Functions

### 1. thor-web-upload-handler

**Runtime**: Node.js 18.x
**Memory**: 512 MB
**Timeout**: 60 seconds

**Environment Variables**:
```bash
JOBS_TABLE=thor-web-jobs
STORAGE_BUCKET=thor-web-storage
AWS_REGION=eu-west-3
```

**Trigger**: API Gateway POST /upload

**Permissions**:
- DynamoDB: PutItem on thor-web-jobs
- S3: PutObject on thor-web-storage
- Transcribe: StartTranscriptionJob

---

### 2. thor-web-transcription-complete

**Runtime**: Node.js 18.x
**Memory**: 256 MB
**Timeout**: 60 seconds

**Environment Variables**:
```bash
JOBS_TABLE=thor-web-jobs
STORAGE_BUCKET=thor-web-storage
ARTICLE_QUEUE_URL=https://sqs.eu-west-3.amazonaws.com/ACCOUNT_ID/thor-web-article-queue
```

**Trigger**: EventBridge rule for Amazon Transcribe job completion

**EventBridge Rule Pattern**:
```json
{
  "source": ["aws.transcribe"],
  "detail-type": ["Transcribe Job State Change"],
  "detail": {
    "TranscriptionJobName": [{"prefix": "thor-web-"}]
  }
}
```

**Permissions**:
- DynamoDB: GetItem, UpdateItem on thor-web-jobs
- S3: GetObject on thor-web-storage
- SQS: SendMessage to thor-web-article-queue

---

### 3. thor-web-article-generator

**Runtime**: Python 3.11
**Memory**: 1024 MB
**Timeout**: 300 seconds (5 minutes)

**Environment Variables**:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx (from Secrets Manager)
JOBS_TABLE=thor-web-jobs
RESULTS_TABLE=thor-web-results
RESULTS_BUCKET=thor-web-storage
AWS_REGION=eu-west-3
```

**Trigger**: SQS thor-web-article-queue

**Batch Size**: 1
**Max Batching Window**: 0 seconds

**Permissions**:
- DynamoDB: GetItem, UpdateItem on thor-web-jobs
- DynamoDB: PutItem on thor-web-results
- S3: PutObject on thor-web-storage
- Secrets Manager: GetSecretValue for Anthropic API key

---

## 🔐 Amazon Cognito

### User Pool: thor-web-users

**Region**: eu-west-3

**Configuration**:
- Sign-in options: Email
- Password policy: Strong
- MFA: Optional
- Self-registration: Enabled
- Email verification: Required

### App Client: thor-web-client

**OAuth Flows**:
- Implicit grant (for frontend SPA)

**OAuth Scopes**:
- openid
- email
- profile

**Callback URLs**:
- http://localhost:3000 (development)
- https://yourapp.example.com (production)

**Domain**:
- Prefix: `thor-web-auth`
- Full: `thor-web-auth.auth.eu-west-3.amazoncognito.com`

---

## 🌐 API Gateway

### REST API: thor-web-api

**Region**: eu-west-3
**Endpoint Type**: Regional

**Resources & Methods**:

```
/
├── /upload (POST)
│   └── Integration: Lambda thor-web-upload-handler
│   └── Authorizer: Cognito User Pool
│
└── /jobs
    ├── GET (list user's jobs)
    │   └── Integration: Lambda (à créer)
    │   └── Authorizer: Cognito User Pool
    │
    └── /{jobId}
        └── GET (get job status)
            └── Integration: Lambda (à créer)
            └── Authorizer: Cognito User Pool
```

**CORS Configuration**:
- Allowed Origins: `*` (or specific domain)
- Allowed Methods: GET, POST, OPTIONS
- Allowed Headers: Content-Type, Authorization

**Deployment Stages**:
- `dev` (development)
- `prod` (production)

---

## 🔔 EventBridge Rule

### Rule: thor-web-transcription-complete-rule

**Event Pattern**:
```json
{
  "source": ["aws.transcribe"],
  "detail-type": ["Transcribe Job State Change"],
  "detail": {
    "TranscriptionJobName": [{"prefix": "thor-web-"}]
  }
}
```

**Target**: Lambda thor-web-transcription-complete

---

## 🔑 Secrets Manager

### Secret: thor-web/anthropic-api-key

**Type**: Other type of secret
**Key/Value**:
```json
{
  "api_key": "sk-ant-api03-xxxxx"
}
```

---

## 👤 IAM Role

### Role: thor-web-lambda-role

**Trust Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**Managed Policies**:
- `AWSLambdaBasicExecutionRole` (CloudWatch Logs)

**Inline Policy - thor-web-permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-west-3:ACCOUNT_ID:table/thor-web-jobs",
        "arn:aws:dynamodb:eu-west-3:ACCOUNT_ID:table/thor-web-jobs/index/*",
        "arn:aws:dynamodb:eu-west-3:ACCOUNT_ID:table/thor-web-results"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::thor-web-storage/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:eu-west-3:ACCOUNT_ID:thor-web-article-queue"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:eu-west-3:ACCOUNT_ID:secret:thor-web/anthropic-api-key-*"
    }
  ]
}
```

---

## 📊 CloudWatch

### Log Groups

Auto-created by Lambda:
- `/aws/lambda/thor-web-upload-handler`
- `/aws/lambda/thor-web-transcription-complete`
- `/aws/lambda/thor-web-article-generator`

**Retention**: 30 days

---

## 💰 Coûts Estimés Mensuels

Basé sur ~100 jobs/mois:

- **Lambda**: ~5€
- **DynamoDB**: ~2€
- **S3**: ~1€
- **Amazon Transcribe**: ~10€ (100h audio)
- **Anthropic API**: ~20€ (dépend de l'utilisation)
- **SQS**: <1€
- **CloudWatch**: ~2€

**Total estimé**: ~40€/mois

---

## 📝 Notes

- Toutes les ressources doivent être dans la région **eu-west-3** (Paris)
- Les noms de ressources utilisent le préfixe `thor-web-`
- Les données sont conservées 30 jours dans thor-web-results (TTL)
- Les fichiers S3 sont supprimés après 90 jours
