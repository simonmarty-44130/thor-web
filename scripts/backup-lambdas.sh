#!/bin/bash
# Backup des Lambdas déployées sur AWS vers S3

BACKUP_BUCKET="thor-backups"
DATE=$(date +%Y%m%d-%H%M%S)

# Créer le bucket de backup si nécessaire
aws s3 mb s3://${BACKUP_BUCKET} 2>/dev/null || true

# Backup de chaque Lambda
for LAMBDA in thor-web-upload-handler thor-web-transcription-complete thor-web-article-generator; do
  echo "Backup de ${LAMBDA}..."
  
  # Télécharger le code depuis AWS Lambda
  aws lambda get-function --function-name ${LAMBDA} \
    --query 'Code.Location' --output text | xargs curl -o /tmp/${LAMBDA}.zip
  
  # Upload vers S3
  aws s3 cp /tmp/${LAMBDA}.zip s3://${BACKUP_BUCKET}/lambdas/${DATE}/${LAMBDA}.zip
  
  echo "✅ ${LAMBDA} sauvegardé"
done

echo "🎉 Backup terminé dans s3://${BACKUP_BUCKET}/lambdas/${DATE}/"
