#!/bin/bash

# THOR WEB - Deploy Lambda Functions
# Ce script package et déploie les 3 Lambda functions

set -e

REGION="eu-west-3"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==================================="
echo "THOR WEB - Lambda Deployment"
echo "==================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to deploy a Node.js Lambda
deploy_node_lambda() {
    local lambda_name=$1
    local lambda_dir="$PROJECT_ROOT/lambda/$lambda_name"

    echo -e "${BLUE}📦 Packaging $lambda_name...${NC}"

    cd "$lambda_dir"

    # Install dependencies if package.json exists
    if [ -f "package.json" ]; then
        echo "  Installing dependencies..."
        npm install --production
    fi

    # Create zip file
    local zip_file="/tmp/${lambda_name}.zip"
    echo "  Creating zip file..."
    zip -r "$zip_file" . -x "*.git*" "node_modules/.cache/*" > /dev/null

    echo -e "${GREEN}✓ Package created: $zip_file${NC}"
    echo ""

    # TODO: Uncomment when Lambda functions are created in AWS
    # echo "  Deploying to AWS..."
    # aws lambda update-function-code \
    #     --function-name "thor-web-$lambda_name" \
    #     --region "$REGION" \
    #     --zip-file "fileb://$zip_file"

    # echo -e "${GREEN}✓ Deployed $lambda_name${NC}"
}

# Function to deploy a Python Lambda
deploy_python_lambda() {
    local lambda_name=$1
    local lambda_dir="$PROJECT_ROOT/lambda/$lambda_name"

    echo -e "${BLUE}📦 Packaging $lambda_name...${NC}"

    cd "$lambda_dir"

    # Create a temporary directory for packaging
    local temp_dir="/tmp/${lambda_name}_package"
    rm -rf "$temp_dir"
    mkdir -p "$temp_dir"

    # Copy Lambda code
    cp index.py "$temp_dir/"

    # Install dependencies if requirements.txt exists
    if [ -f "requirements.txt" ]; then
        echo "  Installing Python dependencies..."
        pip3 install -r requirements.txt -t "$temp_dir" > /dev/null
    fi

    # Create zip file
    local zip_file="/tmp/${lambda_name}.zip"
    cd "$temp_dir"
    echo "  Creating zip file..."
    zip -r "$zip_file" . > /dev/null

    echo -e "${GREEN}✓ Package created: $zip_file${NC}"
    echo ""

    # Clean up temp directory
    rm -rf "$temp_dir"

    # TODO: Uncomment when Lambda functions are created in AWS
    # echo "  Deploying to AWS..."
    # aws lambda update-function-code \
    #     --function-name "thor-web-$lambda_name" \
    #     --region "$REGION" \
    #     --zip-file "fileb://$zip_file"

    # echo -e "${GREEN}✓ Deployed $lambda_name${NC}"
}

# Deploy all Lambdas
echo "Starting Lambda deployment..."
echo ""

# 1. Upload Handler (Node.js)
deploy_node_lambda "upload-handler"

# 2. Transcription Complete (Node.js)
deploy_node_lambda "transcription-complete"

# 3. Article Generator (Python)
deploy_python_lambda "article-generator"

echo ""
echo -e "${GREEN}==================================="
echo "✓ All Lambdas packaged successfully!"
echo "===================================${NC}"
echo ""
echo "Note: AWS deployment is commented out."
echo "Uncomment the aws lambda update-function-code commands"
echo "after creating the Lambda functions in AWS."
echo ""
echo "Package files are in /tmp/:"
echo "  - upload-handler.zip"
echo "  - transcription-complete.zip"
echo "  - article-generator.zip"
echo ""
