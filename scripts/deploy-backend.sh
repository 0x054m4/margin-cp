#!/usr/bin/env bash
set -euo pipefail
STACK_NAME="${1:-margin}"
AWS_REGION="${2:-us-east-1}"
export AWS_REGION
DEPLOY_OPTIONS=(--no-fail-on-empty-changeset)
if [[ -n "${SES_IDENTITY_ARN:-}" || -n "${SES_FROM_ADDRESS:-}" ]]; then
  : "${SES_IDENTITY_ARN:?Set both SES_IDENTITY_ARN and SES_FROM_ADDRESS}"
  : "${SES_FROM_ADDRESS:?Set both SES_IDENTITY_ARN and SES_FROM_ADDRESS}"
  DEPLOY_OPTIONS+=(--parameter-overrides "SesIdentityArn=$SES_IDENTITY_ARN" "SesFromAddress=$SES_FROM_ADDRESS")
fi
mkdir -p .aws-sam/build/ApiFunction
cp -R backend/src backend/package.json backend/package-lock.json .aws-sam/build/ApiFunction/
npm ci --prefix .aws-sam/build/ApiFunction --workspaces=false --omit=dev --cache .aws-sam/npm-cache
aws cloudformation deploy --template-file infrastructure/artifacts.yaml --stack-name "$STACK_NAME-artifacts" --region "$AWS_REGION" --no-fail-on-empty-changeset
ARTIFACT_BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME-artifacts" --region "$AWS_REGION" --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue | [0]' --output text)"
node --input-type=module -e "import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';const template=await readFile('template.yaml','utf8');await writeFile('.aws-sam/deploy.yaml',template.replace('CodeUri: backend/','CodeUri: '+resolve('.aws-sam/build/ApiFunction')));"
aws cloudformation package --template-file .aws-sam/deploy.yaml --s3-bucket "$ARTIFACT_BUCKET" --output-template-file .aws-sam/packaged.yaml --region "$AWS_REGION"
aws cloudformation deploy --template-file .aws-sam/packaged.yaml --stack-name "$STACK_NAME" --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --region "$AWS_REGION" "${DEPLOY_OPTIONS[@]}"
