const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { docClient, ok, created, badRequest, unauthorized, serverError, requireAdmin } = require('./utils');

const TABLE = process.env.CHECKPOINTS_TABLE;

const createCheckpoint = async (event) => {
  try {
    if (!requireAdmin(event)) return unauthorized();
    const { id: eventId } = event.pathParameters;
    const body = JSON.parse(event.body || '{}');
    if (!body.name) return badRequest('Název kontrolního bodu je povinný');
    if (body.lat === undefined || body.lng === undefined) return badRequest('Souřadnice jsou povinné');

    const item = {
      id: uuidv4(),
      eventId,
      name: body.name,
      lat: parseFloat(body.lat),
      lng: parseFloat(body.lng),
      radius: parseInt(body.radius || 50),
      order: parseInt(body.order || 0),
      createdAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
    return created(item);
  } catch (err) {
    console.error(err);
    return serverError(err.message);
  }
};

const listCheckpoints = async (event) => {
  try {
    const { id: eventId } = event.pathParameters;
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'eventId-index',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':eventId': eventId },
    }));
    const items = (result.Items || []).sort((a, b) => a.order - b.order);
    return ok(items);
  } catch (err) {
    console.error(err);
    return serverError(err.message);
  }
};

module.exports = { createCheckpoint, listCheckpoints };
