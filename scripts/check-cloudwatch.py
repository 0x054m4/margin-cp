"""Read-only monitoring verification; credentials and log messages are never printed.
Usage: AWS_PROFILE=margin python3 scripts/check-cloudwatch.py margin us-east-1
"""
import datetime
import json
import subprocess
import sys
import time
from urllib.parse import urlparse

stack = sys.argv[1] if len(sys.argv) > 1 else 'margin'
region = sys.argv[2] if len(sys.argv) > 2 else 'us-east-1'

def aws(*args):
    result = subprocess.run(['aws', *args, '--region', region, '--output', 'json'],
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('AWS command failed: ' + result.stderr.strip())
    return json.loads(result.stdout)

outputs = aws('cloudformation', 'describe-stacks', '--stack-name', stack)['Stacks'][0]['Outputs']
config = {o['OutputKey']: o['OutputValue'] for o in outputs}
api_id = urlparse(config['ApiUrl']).hostname.split('.')[0]
assert aws('apigateway', 'get-rest-api', '--rest-api-id', api_id)['name'] == config['ApiMetricName'], 'API metric name mismatch'
name = config['LambdaLogGroupName']
groups = aws('logs', 'describe-log-groups', '--log-group-name-prefix', name)['logGroups']
assert any(g['logGroupName'] == name and g.get('retentionInDays') == 14 for g in groups), 'Log retention mismatch'
print('PASS: Lambda log group exists with 14-day retention', flush=True)

dashboard = json.loads(aws('cloudwatch', 'get-dashboard', '--dashboard-name', config['CloudWatchDashboardName'])['DashboardBody'])
metric = next(w for w in dashboard['widgets'] if w['type'] == 'metric')['properties']
expected = ['AWS/ApiGateway', '4XXError', 'ApiName', config['ApiMetricName'], 'Stage', 'prod']
assert metric['metrics'] == [expected] and metric['stat'] == 'Sum' and metric['period'] == 300, 'Metric configuration mismatch'
print('PASS: Dashboard uses the correct API Gateway 4XXError stage metric', flush=True)

queries = aws('logs', 'describe-query-definitions', '--query-definition-name-prefix', stack + '/lambda-recent-events')['queryDefinitions']
query = next(q for q in queries if q['queryDefinitionId'] == config['LambdaLogsQueryId'])
assert query['logGroupNames'] == [name], 'Saved query log group mismatch'
print('PASS: Saved Logs Insights query is scoped to the Lambda log group', flush=True)

now = datetime.datetime.now(datetime.timezone.utc)
metrics = aws('cloudwatch', 'get-metric-statistics', '--namespace', 'AWS/ApiGateway', '--metric-name', '4XXError',
              '--dimensions', 'Name=ApiName,Value=' + config['ApiMetricName'], 'Name=Stage,Value=prod',
              '--start-time', (now - datetime.timedelta(days=1)).isoformat(), '--end-time', now.isoformat(),
              '--period', '300', '--statistics', 'Sum')
print('INFO: 4XXError datapoints in the last 24 hours:', len(metrics['Datapoints']), flush=True)

query_id = aws('logs', 'start-query', '--log-group-name', name, '--start-time', str(int(now.timestamp()) - 86400),
               '--end-time', str(int(now.timestamp())), '--query-string', query['queryString'])['queryId']
try:
    for _ in range(30):
        result = aws('logs', 'get-query-results', '--query-id', query_id)
        if result['status'] == 'Complete':
            print('PASS: Logs Insights query completed; rows:', len(result['results']), flush=True)
            break
        if result['status'] not in ('Scheduled', 'Running'):
            raise RuntimeError('Logs Insights query status: ' + result['status'])
        time.sleep(2)
    else:
        raise TimeoutError('Logs Insights query did not finish within the verification window')
except BaseException:
    aws('logs', 'stop-query', '--query-id', query_id)
    raise
print('Dashboard:', config['CloudWatchDashboardUrl'])
