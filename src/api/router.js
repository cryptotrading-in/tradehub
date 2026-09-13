const routes = new Map();

export function route(method, pathname, handler) {
  routes.set(`${method.toUpperCase()} ${pathname}`, handler);
}

export async function dispatch(request, env) {
  const url = new URL(request.url);
  const key = `${request.method.toUpperCase()} ${url.pathname}`;
  const handler = routes.get(key);

  if (!handler) {
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  try {
    return await handler({ request, env, url });
  } catch (error) {
    console.error('API error', error);
    return Response.json(
      {
        ok: false,
        error: 'Internal server error',
        diagnostic: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
