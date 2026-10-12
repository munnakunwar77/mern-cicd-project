const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Task = require('../src/models/Task');

let mongod;
let mongoUri;

// CI starts a real MongoDB container (scripts/ci-mongo.sh) and sets MONGO_TEST_URI.
// Locally the tests fall back to an in-memory MongoDB.
beforeAll(async () => {
  let uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  mongoUri = uri;
  try {
    // Fail in 15s with a readable message instead of hanging for Mongoose's 30s default.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    throw new Error(
      `Cannot connect to MongoDB at "${uri}": ${err.message}\n` +
        'In Jenkins: check the mongo-test container is running and shares a Docker network with Jenkins.'
    );
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Task.deleteMany({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('reports ok when the database is connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });

  it('exposes the deployed version', async () => {
    process.env.APP_VERSION = '42-abc1234';
    const res = await request(app).get('/api/health');
    expect(res.body.version).toBe('42-abc1234');
    delete process.env.APP_VERSION;
  });

  it('answers 503 when the database is disconnected, so a bad release gets no traffic', async () => {
    await mongoose.disconnect();
    try {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.db).toBe('disconnected');
    } finally {
      // always restore the connection so the remaining tests can run
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    }
  });
});

describe('/api/tasks', () => {
  it('creates and lists tasks', async () => {
    const created = await request(app).post('/api/tasks').send({ title: 'Ship it' });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Ship it');
    expect(created.body.completed).toBe(false);

    const list = await request(app).get('/api/tasks');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it('lists the newest task first', async () => {
    await request(app).post('/api/tasks').send({ title: 'first' });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await request(app).post('/api/tasks').send({ title: 'second' });

    const list = await request(app).get('/api/tasks');
    expect(list.body.map((t) => t.title)).toEqual(['second', 'first']);
  });

  it('trims the title before saving', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '  padded  ' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('padded');
  });

  it('rejects an empty title', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Title is required');
  });

  it('rejects a missing title', async () => {
    const res = await request(app).post('/api/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Title is required');
  });

  it('rejects a non-string title with 400 instead of crashing with 500', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Title must be a string');
  });

  it('rejects a title longer than 140 characters', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'x'.repeat(141) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 140/);
  });

  it('answers 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON body');
  });

  it('answers 413 for an oversized body', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'x'.repeat(150 * 1024) });
    expect(res.status).toBe(413);
  });

  it('updates the completed flag of a task', async () => {
    const { body } = await request(app).post('/api/tasks').send({ title: 'Write tests' });
    const res = await request(app).put(`/api/tasks/${body._id}`).send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it('updates the title of a task', async () => {
    const { body } = await request(app).post('/api/tasks').send({ title: 'Old' });
    const res = await request(app).put(`/api/tasks/${body._id}`).send({ title: ' New ' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
  });

  it('rejects an invalid title on update', async () => {
    const { body } = await request(app).post('/api/tasks').send({ title: 'Keep me' });
    const res = await request(app).put(`/api/tasks/${body._id}`).send({ title: '   ' });
    expect(res.status).toBe(400);
    expect((await Task.findById(body._id)).title).toBe('Keep me');
  });

  it('rejects an update that changes nothing', async () => {
    const { body } = await request(app).post('/api/tasks').send({ title: 'Static' });
    const res = await request(app).put(`/api/tasks/${body._id}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a missing task', async () => {
    const res = await request(app)
      .put(`/api/tasks/${new mongoose.Types.ObjectId()}`)
      .send({ completed: true });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(app).delete('/api/tasks/not-an-id');
    expect(res.status).toBe(400);
  });

  it('deletes a task', async () => {
    const { body } = await request(app).post('/api/tasks').send({ title: 'Remove me' });
    const res = await request(app).delete(`/api/tasks/${body._id}`);
    expect(res.status).toBe(204);
    expect(await Task.countDocuments()).toBe(0);
  });

  it('returns 404 when deleting a missing task', async () => {
    const res = await request(app).delete(`/api/tasks/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });

  it('answers 500 without leaking details when the database call fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Task, 'find').mockImplementation(() => {
      throw new Error('secret connection string leaked');
    });
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
