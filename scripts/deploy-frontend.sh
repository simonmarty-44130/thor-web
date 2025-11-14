#!/bin/bash

# THOR WEB - Deploy Frontend
# Ce script build et déploie le frontend React vers S3

set -e

REGION="eu-west-3"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# TODO: Remplacer par le vrai nom du bucket S3 après création
S3_BUCKET="thor-web-frontend"

# TODO: Remplacer par la vraie distribution CloudFront après création
CLOUDFRONT_DISTRIBUTION_ID=""

echo "==================================="
echo "THOR WEB - Frontend Deployment"
echo "==================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

cd "$FRONTEND_DIR"

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Build for production
echo -e "${BLUE}🔨 Building React app...${NC}"
npm run build

echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# TODO: Uncomment when S3 bucket is created
# echo -e "${BLUE}☁️  Uploading to S3...${NC}"
# aws s3 sync build/ "s3://$S3_BUCKET/" --delete --region "$REGION"

# echo -e "${GREEN}✓ Uploaded to S3${NC}"
# echo ""

# TODO: Uncomment when CloudFront distribution is created
# if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
#     echo -e "${BLUE}🔄 Invalidating CloudFront cache...${NC}"
#     aws cloudfront create-invalidation \
#         --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
#         --paths "/*"
#     echo -e "${GREEN}✓ Cache invalidated${NC}"
# fi

echo ""
echo -e "${GREEN}==================================="
echo "✓ Frontend built successfully!"
echo "===================================${NC}"
echo ""
echo "Build output is in: $FRONTEND_DIR/build/"
echo ""
echo "Note: S3 upload and CloudFront invalidation are commented out."
echo "Update the S3_BUCKET and CLOUDFRONT_DISTRIBUTION_ID variables,"
echo "then uncomment the deployment commands."
echo ""
