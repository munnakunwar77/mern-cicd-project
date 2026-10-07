const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Task = require('../src/models/Task');

let mongod;

// CI starts a real MongoDB container and sets MONGO_TEST_URI.
// Locally the tests fall back to an in-memory MongoDB.
beforeAll(async () => {
  let uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Task.deleteMany({});
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

  it('rejects an empty title', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('updates a task', async () => {
    const { body } = await request(app).post('/api/tasks').send({ title: 'Write tests' });
    const res = await request(app).put(`/api/tasks/${body._id}`).send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
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

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});
