# 📦 Guide de Backup & Restauration THOR WEB

## Qu'est-ce qui est sauvegardé ?

### ✅ Dans Git (automatique)
- 📄 Code source de tous les Lambdas (`index.py`, `index.js`)
- 📋 Fichiers de configuration (`package.json`, `requirements.txt`)
- 🎨 Code frontend complet
- 🔧 Configuration infrastructure

### ❌ PAS dans Git (trop volumineux)
- 📦 `node_modules/` - Dépendances Node.js
- 🐍 Packages Python (anthropic, boto3, urllib3, etc.)
- 🏗️ Dossier `build/` du frontend

## 🔄 Stratégie de Backup

### Option 1 : Recréer depuis les sources (RECOMMANDÉ)

**Avantages** : Simple, reproductible, toujours à jour

```bash
# 1. Cloner le repo
git clone https://github.com/simonmarty-44130/thor-web.git
cd thor-web

# 2. Réinstaller les dépendances Python Lambda
cd lambda/article-generator
pip install -r requirements.txt -t .
cd ../..

# 3. Réinstaller les dépendances Node.js Lambdas
cd lambda/upload-handler && npm install && cd ../..
cd lambda/transcription-complete && npm install && cd ../..

# 4. Réinstaller les dépendances frontend
cd frontend && npm install && cd ..
```

### Option 2 : Backup S3 des Lambdas déployées

**Avantages** : Snapshot exact de la production

#### Créer un backup

```bash
# Copier le script de backup
cp scripts/backup-lambdas.sh /tmp/
chmod +x /tmp/backup-lambdas.sh

# Exécuter le backup
/tmp/backup-lambdas.sh
```

Cela sauvegarde les 3 Lambdas dans `s3://thor-backups/lambdas/YYYYMMDD-HHMMSS/`

#### Restaurer depuis un backup

```bash
# Lister les backups disponibles
aws s3 ls s3://thor-backups/lambdas/

# Restaurer un backup spécifique
cp scripts/restore-lambdas.sh /tmp/
chmod +x /tmp/restore-lambdas.sh
/tmp/restore-lambdas.sh 20251125-143000
```

### Option 3 : Export manuel d'une Lambda

```bash
# Télécharger le code d'une Lambda spécifique
aws lambda get-function \
  --function-name thor-web-article-generator \
  --query 'Code.Location' \
  --output text | xargs curl -o backup.zip

# Restaurer plus tard
aws lambda update-function-code \
  --function-name thor-web-article-generator \
  --zip-file fileb://backup.zip
```

## 🗄️ Backup de la Base de Données

### DynamoDB

```bash
# Backup manuel d'une table
aws dynamodb create-backup \
  --table-name thor-web-jobs \
  --backup-name thor-web-jobs-backup-$(date +%Y%m%d)

aws dynamodb create-backup \
  --table-name thor-web-results \
  --backup-name thor-web-results-backup-$(date +%Y%m%d)

# Lister les backups
aws dynamodb list-backups --table-name thor-web-jobs

# Restaurer depuis un backup
aws dynamodb restore-table-from-backup \
  --target-table-name thor-web-jobs-restored \
  --backup-arn <backup-arn>
```

### Point-in-Time Recovery (PITR)

Pour activer la récupération continue (protection contre erreurs) :

```bash
aws dynamodb update-continuous-backups \
  --table-name thor-web-jobs \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

## 📁 Backup du Frontend (S3)

```bash
# Créer un snapshot du bucket frontend
aws s3 sync s3://thor-web-frontend s3://thor-web-frontend-backup-$(date +%Y%m%d)/ --delete

# Restaurer
aws s3 sync s3://thor-web-frontend-backup-20251125/ s3://thor-web-frontend/ --delete
```

## 🔑 Backup des Secrets

```bash
# Sauvegarder les secrets (ATTENTION : sensible!)
aws secretsmanager get-secret-value \
  --secret-id thor-anthropic-api-key \
  --query 'SecretString' \
  --output text > /tmp/anthropic-key.txt.gpg

# Chiffrer le fichier
gpg -c /tmp/anthropic-key.txt

# Stocker dans un endroit sécurisé (PAS dans Git!)
```

## 📊 Récapitulatif

| Composant | Méthode | Fréquence | Lieu |
|-----------|---------|-----------|------|
| Code source | Git | À chaque commit | GitHub |
| Lambdas déployées | S3 Backup | Avant déploiement | S3 |
| DynamoDB | AWS Backup | Quotidien | AWS |
| Secrets | Manuel chiffré | Annuel | Coffre-fort |
| Frontend S3 | S3 Sync | Avant déploiement | S3 |

## 🚨 Plan de Disaster Recovery

En cas de problème grave :

1. **Code perdu** → Cloner depuis GitHub
2. **Lambdas corrompues** → Restaurer depuis S3 backup OU recréer depuis Git
3. **DynamoDB effacée** → Restaurer depuis AWS Backup
4. **Frontend S3 effacé** → Rebuild depuis Git + déployer
5. **Secrets perdus** → Restaurer depuis backup chiffré

## 📝 Checklist avant gros changement

- [ ] Git commit + push
- [ ] Backup Lambdas vers S3
- [ ] Snapshot DynamoDB (si modif schéma)
- [ ] Tag Git : `git tag v1.0.1 && git push --tags`
