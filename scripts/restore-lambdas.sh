#!/bin/bash
# Restauration des Lambdas depuis un backup S3

BACKUP_BUCKET="thor-backups"
BACKUP_DATE=$1

if [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <backup-date>"
  echo "Exemple: $0 20251125-143000"
  echo ""
  echo "Backups disponibles:"
  aws s3 ls s3://${BACKUP_BUCKET}/lambdas/ | awk '{print $2}' | sed 's|/$||'
  exit 1
fi

# Restaurer chaque Lambda
for LAMBDA in thor-web-upload-handler thor-web-transcription-complete thor-web-article-generator; do
  echo "Restauration de ${LAMBDA}..."
  
  # Télécharger depuis S3
  aws s3 cp s3://${BACKUP_BUCKET}/lambdas/${BACKUP_DATE}/${LAMBDA}.zip /tmp/${LAMBDA}.zip
  
  # Déployer sur AWS Lambda
  aws lambda update-function-code \
    --function-name ${LAMBDA} \
    --zip-file fileb:///tmp/${LAMBDA}.zip
  
  echo "✅ ${LAMBDA} restauré"
done

echo "🎉 Restauration terminée!"
