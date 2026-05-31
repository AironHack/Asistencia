const API_URL = import.meta.env.VITE_API_URL || '/api';

const authHandlers = {
  getAccessToken: () => '',
  getRefreshToken: () => '',
  setAccessToken: () => {},
  onUnauthorized: () => {}
};

export function configurarAuth(handlers) {
  Object.assign(authHandlers, handlers);
}

async function refreshAccessToken() {
  const refreshToken = authHandlers.getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.accessToken) {
    return null;
  }

  authHandlers.setAccessToken(data.accessToken);
  return data.accessToken;
}

async function request(path, options = {}, intentoRefresh = true) {
  const token = options.token ?? authHandlers.getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    const apiError = new Error('No se pudo conectar con el backend. Verifica que la API este encendida.');
    apiError.status = 0;
    apiError.cause = error;
    throw apiError;
  }

  const data = await response.json().catch(() => ({}));

  const esAuthSinRefresh = path === '/auth/login' || path === '/auth/refresh';

  if (response.status === 401 && intentoRefresh && !esAuthSinRefresh) {
    const nuevoToken = await refreshAccessToken();

    if (nuevoToken) {
      return request(path, { ...options, token: nuevoToken }, false);
    }

    authHandlers.onUnauthorized();
  }

  if (!response.ok) {
    const error = new Error(data.mensaje || 'Error de comunicacion con la API');
    error.status = response.status;
    error.detalle = data;
    throw error;
  }

  return data;
}

export const api = {
  baseUrl: API_URL,
  get(path, token) {
    return request(path, { token });
  },
  post(path, body, token) {
    return request(path, { method: 'POST', body, token });
  },
  put(path, body, token) {
    return request(path, { method: 'PUT', body, token });
  },
  patch(path, body, token) {
    return request(path, { method: 'PATCH', body, token });
  }
};
