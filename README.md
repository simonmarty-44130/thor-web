# THOR WEB - MP3 to Article Generator

🎙️ Transformez automatiquement vos fichiers MP3 en articles web de qualité grâce à l'intelligence artificielle.

---

## 📋 Vue d'ensemble

**THOR WEB** est une application serverless qui combine transcription audio et génération de contenu IA pour créer automatiquement des articles web à partir de fichiers MP3.

**Architecture inspirée de** :
- 🎯 **Gabriel** : Transcription audio avec Amazon Transcribe
- ⚡ **Thor KTO V2** : Génération de contenu avec Claude API

---

## ✨ Fonctionnalités

- 🎧 **Upload MP3** : Drag & drop de fichiers jusqu'à 500MB
- 📝 **Transcription automatique** : Amazon Transcribe (français)
- 🤖 **Génération d'article IA** : Claude API pour créer des articles web structurés
- 🔐 **Authentification** : Amazon Cognito
- ⚡ **Interface React moderne** : Suivi en temps réel du traitement
- 📊 **Statut en temps réel** : Polling automatique de l'état du job

---

## 🏗️ Architecture

```
┌─────────────────────┐
│  Frontend React     │
│  (S3 + CloudFront)  │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│   API Gateway       │
│  + Cognito Auth     │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐     ┌─────────────────────┐
│  Upload Handler     │────▶│  S3 Storage         │
│  Lambda (Node.js)   │     │  (MP3 files)        │
└──────────┬──────────┘     └─────────────────────┘
           │
           ↓
┌─────────────────────┐
│ Amazon Transcribe   │
│ (Audio → Text)      │
└──────────┬──────────┘
           │
           ↓ EventBridge
┌─────────────────────┐
│ Transcription       │
│ Complete Handler    │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐     ┌─────────────────────┐
│  SQS Queue          │────▶│  Article Generator  │
│                     │     │  Lambda (Python)    │
└─────────────────────┘     │  + Claude API       │
                            └──────────┬──────────┘
                                       │
                                       ↓
                            ┌─────────────────────┐
                            │  DynamoDB           │
                            │  (Jobs + Results)   │
                            └─────────────────────┘
```

---

## 📁 Structure du Projet

```
thor-web/
├── lambda/                      # Lambda Functions
│   ├── upload-handler/          # Upload MP3 + start transcription
│   │   ├── index.js
│   │   └── package.json
│   ├── transcription-complete/  # Handle transcription completion
│   │   ├── index.js
│   │   └── package.json
│   └── article-generator/       # Generate article with Claude
│       ├── index.py
│       └── requirements.txt
│
├── frontend/                    # React Application
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUploader.tsx
│   │   │   └── FileUploader.css
│   │   ├── services/
│   │   │   ├── auth.ts
│   │   │   └── api.ts
│   │   ├── config/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   ├── App.css
│   │   └── index.tsx
│   ├── public/
│   └── package.json
│
├── scripts/                     # Deployment Scripts
│   ├── deploy-lambdas.sh
│   └── deploy-frontend.sh
│
├── docs/                        # Documentation
│   └── AWS_RESOURCES.md
│
└── README.md
```

---

## 🚀 Installation

### Prérequis

- Node.js 18+
- Python 3.11+
- AWS CLI configuré
- Compte Anthropic (pour Claude API)

### 1. Cloner le projet

```bash
cd /Users/directionradiofidelite/thor-web
```

### 2. Configurer les Lambdas

```bash
# Upload Handler
cd lambda/upload-handler
npm install

# Transcription Complete
cd ../transcription-complete
npm install

# Article Generator
cd ../article-generator
pip3 install -r requirements.txt
```

### 3. Configurer le Frontend

```bash
cd frontend
npm install
```

### 4. Créer les ressources AWS

Suivre la documentation dans `docs/AWS_RESOURCES.md` pour créer :
- Tables DynamoDB
- Buckets S3
- SQS Queue
- Lambda Functions
- Cognito User Pool
- API Gateway
- EventBridge Rule

### 5. Configurer les variables d'environnement

**Frontend** (`frontend/src/config/index.ts`) :
```typescript
api: {
  endpoint: 'https://YOUR_API_ID.execute-api.eu-west-3.amazonaws.com/prod'
},
cognito: {
  userPoolId: 'eu-west-3_XXXXXXXXX',
  clientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  domain: 'thor-web-auth'
}
```

**Lambdas** (via AWS Console ou CLI) :
```bash
# upload-handler
JOBS_TABLE=thor-web-jobs
STORAGE_BUCKET=thor-web-storage

# transcription-complete
JOBS_TABLE=thor-web-jobs
STORAGE_BUCKET=thor-web-storage
ARTICLE_QUEUE_URL=https://sqs.eu-west-3.amazonaws.com/ACCOUNT_ID/thor-web-article-queue

# article-generator
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
JOBS_TABLE=thor-web-jobs
RESULTS_TABLE=thor-web-results
RESULTS_BUCKET=thor-web-storage
```

---

## 📝 Configuration du Prompt Claude

**📍 Emplacement** : `/Users/directionradiofidelite/thor-web/lambda/article-generator/index.py:153`

Le prompt Claude est actuellement un placeholder. Pour le mettre à jour :

1. Ouvrir `lambda/article-generator/index.py`
2. Trouver la fonction `generate_article_with_retry()` ligne 99
3. Remplacer le prompt à la ligne 153 :

```python
# REMPLACER CE PROMPT PAR LE VÔTRE
prompt = f"""VOTRE PROMPT ICI

Fichier audio: {file_name}

TRANSCRIPTION :
{transcript_text[:50000]}"""
```

**Le prompt doit générer un article avec la structure suivante** :
```
TITRE: [titre de l'article]
INTRODUCTION: [2-3 phrases d'introduction]
ARTICLE: [contenu principal]
CONCLUSION: [phrase de conclusion]
```

**⚠️ Important** : Après modification du prompt, redéployer la Lambda :
```bash
cd scripts
./deploy-lambdas.sh
```

---

## 🔧 Déploiement

### Déployer les Lambdas

```bash
cd scripts
chmod +x deploy-lambdas.sh
./deploy-lambdas.sh
```

Le script va :
1. Installer les dépendances
2. Créer les packages ZIP
3. (Optionnel) Déployer vers AWS

### Déployer le Frontend

```bash
cd scripts
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

Le script va :
1. Build le React app
2. (Optionnel) Upload vers S3
3. (Optionnel) Invalider le cache CloudFront

---

## 🧪 Tests

### Test local du Frontend

```bash
cd frontend
npm start
```

L'application sera accessible sur `http://localhost:3000`

### Test des Lambdas

```bash
# Test upload-handler
cd lambda/upload-handler
node -e "console.log(require('./index').handler)"

# Test article-generator
cd lambda/article-generator
python3 -c "import index; print('OK')"
```

---

## 📊 Workflow Complet

1. **Utilisateur upload un MP3** via le frontend
   - Frontend → API Gateway → upload-handler Lambda

2. **upload-handler Lambda** :
   - Sauvegarde le MP3 dans S3
   - Lance Amazon Transcribe
   - Crée un job dans DynamoDB (status: TRANSCRIBING)

3. **Amazon Transcribe** :
   - Transcrit l'audio en texte
   - Sauvegarde le résultat dans S3
   - Déclenche EventBridge

4. **transcription-complete Lambda** :
   - Récupère la transcription depuis S3
   - Met à jour le job (status: TRANSCRIBED)
   - Envoie le texte à la SQS queue

5. **article-generator Lambda** :
   - Reçoit le message SQS
   - Met à jour le job (status: GENERATING)
   - Appelle Claude API avec le prompt
   - Parse la réponse
   - Sauvegarde l'article dans DynamoDB et S3
   - Met à jour le job (status: COMPLETED)

6. **Frontend** :
   - Poll le statut du job toutes les 3 secondes
   - Affiche le statut en temps réel
   - Affiche l'article quand complété

---

## 🔐 Sécurité

- ✅ Authentification via **Amazon Cognito**
- ✅ Tokens JWT sur toutes les API calls
- ✅ CORS configuré
- ✅ Clé API Claude dans **Secrets Manager**
- ✅ Chiffrement at-rest (S3, DynamoDB)
- ✅ TTL sur les données sensibles (30 jours)

---

## 📈 Monitoring

### CloudWatch Logs

```bash
# Logs upload-handler
aws logs tail /aws/lambda/thor-web-upload-handler --follow

# Logs transcription-complete
aws logs tail /aws/lambda/thor-web-transcription-complete --follow

# Logs article-generator
aws logs tail /aws/lambda/thor-web-article-generator --follow
```

### Vérifier les jobs en cours

```bash
# Scanner les jobs
aws dynamodb scan \
  --table-name thor-web-jobs \
  --filter-expression "#status IN (:transcribing, :generating)" \
  --expression-attribute-names '{"#status":"status"}' \
  --expression-attribute-values '{":transcribing":{"S":"TRANSCRIBING"},":generating":{"S":"GENERATING"}}'
```

---

## 💰 Coûts

Estimation pour **100 jobs/mois** (1h audio chacun) :

| Service | Coût mensuel |
|---------|--------------|
| Lambda | ~5€ |
| DynamoDB | ~2€ |
| S3 | ~1€ |
| Amazon Transcribe | ~10€ |
| Anthropic API (Claude) | ~20€ |
| SQS | <1€ |
| CloudWatch | ~2€ |
| **TOTAL** | **~40€/mois** |

---

## 🐛 Dépannage

### Erreur "TRANSCRIPTION_FAILED"
- Vérifier que le fichier est un MP3 valide
- Vérifier les permissions S3 de Transcribe
- Consulter les logs CloudWatch

### Erreur "FAILED" (génération)
- Vérifier que la clé API Claude est valide
- Vérifier les logs de article-generator Lambda
- Vérifier que le prompt est correct

### Le frontend ne reçoit pas le résultat
- Vérifier que le polling fonctionne (Developer Tools → Network)
- Vérifier les permissions CORS de l'API Gateway
- Vérifier que le job existe dans DynamoDB

---

## 🔄 Prochaines Améliorations

- [ ] WebSocket pour updates temps réel (au lieu du polling)
- [ ] Support multi-formats audio (WAV, M4A, etc.)
- [ ] Export PDF/DOCX des articles générés
- [ ] Historique complet des jobs utilisateur
- [ ] Régénération d'article avec feedback
- [ ] Multi-langue (transcription + génération)
- [ ] Dashboard analytics

---

## 📚 Documentation

- [AWS Resources](docs/AWS_RESOURCES.md) - Liste complète des ressources AWS
- [Gabriel Project](../gabriel/) - Projet de référence pour la transcription
- [Thor KTO V2](../kto-v2/) - Projet de référence pour Claude API

---

## 🤝 Support

Pour toute question ou problème :
1. Consulter les logs CloudWatch
2. Vérifier la configuration dans `docs/AWS_RESOURCES.md`
3. Tester les Lambda individuellement

---

## 📝 Notes Importantes

- ⚠️ **NE PAS OUBLIER** : Configurer le prompt Claude dans `article-generator/index.py`
- ⚠️ **IMPORTANT** : Mettre à jour les URLs d'API et Cognito dans le frontend
- ⚠️ **SÉCURITÉ** : Ne jamais commiter les clés API dans Git
- ⚠️ **COÛTS** : Monitorer l'utilisation de Transcribe et Claude API

---

**Version** : 1.0.0
**Dernière mise à jour** : 14 novembre 2025
**Maintenu par** : Radio Fidélité
