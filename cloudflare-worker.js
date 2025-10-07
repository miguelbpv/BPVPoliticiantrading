export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');

    if (!target) {
      return new Response('Missing "url" query parameter.', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    let upstream;
    try {
      upstream = new URL(target);
    } catch (error) {
      return new Response('Invalid "url" parameter.', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const headers = new Headers({
      'user-agent':
        'Mozilla/5.0 (compatible; PoliticianStockTracker/1.0; +https://github.com/your-account/BPVPoliticiantrading)',
    });

    const cache = caches.default;
    const cacheKey = new Request(upstream.toString(), { headers });
    let response = await cache.match(cacheKey);

    if (!response) {
      try {
        const upstreamResponse = await fetch(upstream.toString(), {
          headers,
          cf: {
            cacheTtl: 900,
            cacheEverything: true,
          },
        });

        response = new Response(upstreamResponse.body, upstreamResponse);
        response.headers.set('Cache-Control', 'public, max-age=900');
        response.headers.set('Access-Control-Allow-Origin', '*');

        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (error) {
        return new Response('Upstream request failed.', {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    } else {
      response = new Response(response.body, response);
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    return response;
  },
};
