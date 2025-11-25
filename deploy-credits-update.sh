#!/bin/bash

# Script de deploiement des Lambdas avec systeme de credits
# Pour thorpodcast.link - web et titre

set -e

REGION="eu-west-3"
SUBSCRIPTIONS_TABLE="thor-subscriptions"

echo "=============================================="
echo "Deploiement du systeme de credits thorpodcast"
echo "=============================================="

# Couleurs pour le terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ========================================
# 1. DEPLOYER thor-web-article-generator
# ========================================
echo -e "\n${YELLOW}[1/2] Deploiement de thor-web-article-generator (web.thorpodcast.link)${NC}"

# Aller dans le repertoire
cd /Users/directionradiofidelite/thor-web/lambda/article-generator

# Creer le package ZIP
echo "  - Creation du package ZIP..."
rm -f /tmp/article-generator.zip
zip -r /tmp/article-generator.zip . -x "*.pyc" -x "__pycache__/*" -x "*.zip" -q

# Mettre a jour le code de la Lambda
echo "  - Mise a jour du code Lambda..."
aws lambda update-function-code \
    --function-name thor-web-article-generator \
    --zip-file fileb:///tmp/article-generator.zip \
    --region ${REGION} > /dev/null

# Attendre que la mise a jour soit complete
echo "  - Attente de la mise a jour..."
aws lambda wait function-updated \
    --function-name thor-web-article-generator \
    --region ${REGION}

# Ajouter la variable SUBSCRIPTIONS_TABLE
echo "  - Ajout de la variable SUBSCRIPTIONS_TABLE..."

# Recuperer les variables actuelles et les sauvegarder dans un fichier
aws lambda get-function-configuration \
    --function-name thor-web-article-generator \
    --region ${REGION} \
    --query 'Environment.Variables' \
    --output json > /tmp/web-vars.json

# Ajouter SUBSCRIPTIONS_TABLE
jq ". + {\"SUBSCRIPTIONS_TABLE\": \"${SUBSCRIPTIONS_TABLE}\"}" /tmp/web-vars.json > /tmp/web-vars-updated.json

# Mettre a jour la configuration avec le fichier JSON
aws lambda update-function-configuration \
    --function-name thor-web-article-generator \
    --environment "Variables=$(cat /tmp/web-vars-updated.json | jq -c '.')" \
    --region ${REGION} > /dev/null

echo -e "  ${GREEN}OK thor-web-article-generator deploye avec succes${NC}"

# ========================================
# 2. DEPLOYER demo-thor-async-processor
# ========================================
echo -e "\n${YELLOW}[2/2] Deploiement de demo-thor-async-processor (titre.thorpodcast.link)${NC}"

# Aller dans le repertoire
cd /Users/directionradiofidelite/thor-web/lambda/titre-async-processor

# Creer le package ZIP avec les dependances
echo "  - Installation des dependances..."
rm -rf /tmp/titre-async-package
mkdir -p /tmp/titre-async-package
pip install anthropic boto3 chardet -t /tmp/titre-async-package --quiet --upgrade 2>/dev/null

# Copier le code
cp index.py /tmp/titre-async-package/

# Creer le ZIP
echo "  - Creation du package ZIP..."
cd /tmp/titre-async-package
rm -f /tmp/titre-async-processor.zip
zip -r /tmp/titre-async-processor.zip . -x "*.pyc" -x "__pycache__/*" -q

# Mettre a jour le code de la Lambda
echo "  - Mise a jour du code Lambda..."
aws lambda update-function-code \
    --function-name demo-thor-async-processor \
    --zip-file fileb:///tmp/titre-async-processor.zip \
    --region ${REGION} > /dev/null

# Attendre que la mise a jour soit complete
echo "  - Attente de la mise a jour..."
aws lambda wait function-updated \
    --function-name demo-thor-async-processor \
    --region ${REGION}

# Ajouter la variable SUBSCRIPTIONS_TABLE
echo "  - Ajout de la variable SUBSCRIPTIONS_TABLE..."

# Recuperer les variables actuelles et les sauvegarder dans un fichier
aws lambda get-function-configuration \
    --function-name demo-thor-async-processor \
    --region ${REGION} \
    --query 'Environment.Variables' \
    --output json > /tmp/titre-vars.json

# Ajouter SUBSCRIPTIONS_TABLE
jq ". + {\"SUBSCRIPTIONS_TABLE\": \"${SUBSCRIPTIONS_TABLE}\"}" /tmp/titre-vars.json > /tmp/titre-vars-updated.json

# Mettre a jour la configuration avec le fichier JSON
aws lambda update-function-configuration \
    --function-name demo-thor-async-processor \
    --environment "Variables=$(cat /tmp/titre-vars-updated.json | jq -c '.')" \
    --region ${REGION} > /dev/null

echo -e "  ${GREEN}OK demo-thor-async-processor deploye avec succes${NC}"

# ========================================
# RESUME
# ========================================
echo -e "\n${GREEN}=============================================="
echo "Deploiement termine avec succes!"
echo "=============================================="
echo -e "${NC}"
echo "Lambdas mises a jour:"
echo "  - thor-web-article-generator (web.thorpodcast.link)"
echo "    -> Consomme 1 credit audio (remainingAudioCredits) par generation"
echo ""
echo "  - demo-thor-async-processor (titre.thorpodcast.link)"
echo "    -> Consomme 1 credit titre (remainingTitreCredits) par generation"
echo ""
echo "Table des abonnements: ${SUBSCRIPTIONS_TABLE}"
echo ""

# Nettoyage
rm -f /tmp/article-generator.zip
rm -f /tmp/titre-async-processor.zip
rm -rf /tmp/titre-async-package
rm -f /tmp/web-vars.json /tmp/web-vars-updated.json
rm -f /tmp/titre-vars.json /tmp/titre-vars-updated.json
