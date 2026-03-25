export const ok = (body, headers = {}) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

export const created = (body) => ({
  statusCode: 201,
  body: JSON.stringify(body),
});

export const badRequest = (msg) => ({
  statusCode: 400,
  body: JSON.stringify({ error: msg }),
});

export const unauthorized = () => ({
  statusCode: 401,
  body: JSON.stringify({ error: 'Unauthorized' }),
});

export const internalError = () => ({
  statusCode: 500,
  body: JSON.stringify({ error: 'Internal server error' }),
});
