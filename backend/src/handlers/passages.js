const { PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { docClient, ok, created, badRequest, unauthorized, notFound, serverError, getCompetitorCode } = require('./utils');

const PASSAGES_TABLE = process.env.PASSAGES_TABLE;
const CHECKPOINTS_TABLE = process.env.CHECKPOINTS_TABLE;
const COMPETITORS_TABLE = process.env.COMPETITORS_TABLE;

const recordPassage = async (event) => {
  try {
    const competitorCode = getCompetitorCode(event);
    const body = JSON.parse(event.body || '{}');
    if (!body.competitorId) return badRequest('competitorId je povinný');
    if (!body.checkpointId) return badRequest('checkpointId je povinný');
    if (!body.action || !['recorded', 'ignored'].includes(body.action)) {
      return badRequest('action musí být "recorded" nebo "ignored"');
    }

    // Verify competitor exists and code matches (if provided)
    const compResult = await docClient.send(new GetCommand({
      TableName: COMPETITORS_TABLE,
      Key: { id: body.competitorId },
    }));
    if (!compResult.Item) return notFound('Závodník nenalezen');
    if (competitorCode && compResult.Item.accessCode !== competitorCode) {
      return unauthorized('Neplatný kód závodníka');
    }

    const item = {
      id: uuidv4(),
      competitorId: body.competitorId,
      checkpointId: body.checkpointId,
      eventId: compResult.Item.eventId,
      action: body.action,
      timestamp: body.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: PASSAGES_TABLE, Item: item }));
    return created(item);
  } catch (err) {
    console.error(err);
    return serverError(err.message);
  }
};

const listPassages = async (event) => {
  try {
    const { id: eventId } = event.pathParameters;

    // Get all checkpoints for this event
    const cpResult = await docClient.send(new QueryCommand({
      TableName: CHECKPOINTS_TABLE,
      IndexName: 'eventId-index',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':eventId': eventId },
    }));
    const checkpointIds = new Set((cpResult.Items || []).map(c => c.id));

    // Scan passages and filter by event
    const passResult = await docClient.send(new QueryCommand({
      TableName: PASSAGES_TABLE,
      IndexName: 'competitorId-index', // We'll filter by eventId field
      KeyConditionExpression: 'competitorId = :dummy',
      ExpressionAttributeValues: { ':dummy': 'NOOP' },
    })).catch(() => ({ Items: [] }));

    // Use eventId field on passages
    const allPassages = await docClient.send({
      // Fallback: scan with filter
      ...new (require('@aws-sdk/lib-dynamodb').ScanCommand)({
        TableName: PASSAGES_TABLE,
        FilterExpression: 'eventId = :eventId',
        ExpressionAttributeValues: { ':eventId': eventId },
      })
    });

    return ok(allPassages.Items || []);
  } catch (err) {
    console.error(err);
    return serverError(err.message);
  }
};

const getResults = async (event) => {
  try {
    const { id: eventId } = event.pathParameters;

    const [cpResult, compResult, passResult] = await Promise.all([
      docClient.send(new QueryCommand({
        TableName: CHECKPOINTS_TABLE,
        IndexName: 'eventId-index',
        KeyConditionExpression: 'eventId = :eid',
        ExpressionAttributeValues: { ':eid': eventId },
      })),
      docClient.send(new QueryCommand({
        TableName: COMPETITORS_TABLE,
        IndexName: 'eventId-index',
        KeyConditionExpression: 'eventId = :eid',
        ExpressionAttributeValues: { ':eid': eventId },
      })),
      docClient.send(new (require('@aws-sdk/lib-dynamodb').ScanCommand)({
        TableName: PASSAGES_TABLE,
        FilterExpression: 'eventId = :eid',
        ExpressionAttributeValues: { ':eid': eventId },
      })),
    ]);

    const checkpoints = (cpResult.Items || []).sort((a, b) => a.order - b.order);
    const competitors = compResult.Items || [];
    const passages = passResult.Items || [];

    // Build results per competitor
    const results = competitors.map(comp => {
      const compPassages = passages
        .filter(p => p.competitorId === comp.id)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      const recorded = compPassages.filter(p => p.action === 'recorded');
      const checkpointMap = {};
      recorded.forEach(p => { checkpointMap[p.checkpointId] = p; });

      return {
        competitor: { id: comp.id, name: comp.name, number: comp.number, vehicle: comp.vehicle },
        totalCheckpoints: checkpoints.length,
        recordedCount: Object.keys(checkpointMap).length,
        passages: compPassages,
        checkpointDetails: checkpoints.map(cp => ({
          checkpoint: cp,
          passage: checkpointMap[cp.id] || null,
        })),
      };
    }).sort((a, b) => {
      // Sort by recorded count desc, then by competitor number
      if (b.recordedCount !== a.recordedCount) return b.recordedCount - a.recordedCount;
      return String(a.competitor.number).localeCompare(String(b.competitor.number));
    });

    return ok({ eventId, checkpoints, results });
  } catch (err) {
    console.error(err);
    return serverError(err.message);
  }
};

module.exports = { recordPassage, listPassages, getResults };
