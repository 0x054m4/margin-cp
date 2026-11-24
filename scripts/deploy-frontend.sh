#!/usr/bin/env bash
set -euo pipefail
STACK_NAME="${1:-margin}"
AWS_REGION="${2:-us-east-1}"
export AWS_REGION
output() { aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text; }
export API_URL="$(output ApiUrl)"
export COGNITO_CLIENT_ID="$(output CognitoClientId)"
FRONTEND_BUCKET="$(output FrontendBucket)"
DISTRIBUTION_ID="$(output DistributionId)"
for value in "$API_URL" "$COGNITO_CLIENT_ID" "$FRONTEND_BUCKET" "$DISTRIBUTION_ID"; do
  if [[ -z "$value" || "$value" == "None" ]]; then echo 'Missing stack outputs; deploy SAM first.' >&2; exit 1; fi
done
npm run build
aws s3 sync dist/ "s3://$FRONTEND_BUCKET/" --region "$AWS_REGION" --cache-control 'public,max-age=300' --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*'
output WebsiteUrl
