const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

const response = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    ...headers,
  },
  body: JSON.stringify(body),
});

const ok = (body) => response(200, body);
const created = (body) => response(201, body);
const badRequest = (msg) => response(400, { error: msg });
const unauthorized = (msg = 'Unauthorized') => response(401, { error: msg });
const notFound = (msg = 'Not found') => response(404, { error: msg });
const serverError = (msg = 'Internal server error') => response(500, { error: msg });

const requireAdmin = (event) => {
  const key = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
  return key === process.env.ADMIN_KEY;
};

const getCompetitorCode = (event) => {
  return event.headers?.['x-competitor-code'] || event.headers?.['X-Competitor-Code'];
};

module.exports = { docClient, ok, created, badRequest, unauthorized, notFound, serverError, requireAdmin, getCompetitorCode };
