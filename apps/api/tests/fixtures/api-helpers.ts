import { APIRequestContext, expect } from '@playwright/test';

/**
 * API Test Helpers
 *
 * Reusable functions for making API requests and common assertions.
 */

/**
 * Make an authenticated API request
 */
export async function makeRequest(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options: {
    data?: any;
    token?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  // Manually construct full URL since Playwright's baseURL config isn't being applied
  // TypeScript may show error for 'process' but it's available at runtime in Node.js
  const baseURL = (typeof process !== 'undefined' && process.env?.API_URL) || 'http://localhost:3001/api';
  const fullURL = `${baseURL}${endpoint}`;

  // Use specific HTTP methods with full URL
  let response;
  switch (method) {
    case 'GET':
      response = await request.get(fullURL, { headers });
      break;
    case 'POST':
      response = await request.post(fullURL, { headers, data: options.data });
      break;
    case 'PUT':
      response = await request.put(fullURL, { headers, data: options.data });
      break;
    case 'DELETE':
      response = await request.delete(fullURL, { headers });
      break;
  }

  return response;
}

/**
 * Assert successful response (200-299)
 */
export async function expectSuccess(response: any) {
  if (!response.ok()) {
    // Get error details for better debugging
    const status = response.status();
    let errorBody;
    try {
      errorBody = await response.text();
    } catch (e) {
      errorBody = 'Could not read response body';
    }

    // Throw detailed error message
    throw new Error(
      `API request failed:\n` +
      `  URL: ${response.url()}\n` +
      `  Status: ${status} ${response.statusText()}\n` +
      `  Body: ${errorBody}`
    );
  }
  expect(response.ok()).toBeTruthy();
  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(300);

  // Handle empty responses (204 No Content or empty body)
  const contentType = response.headers()['content-type'] || '';
  if (response.status() === 204 || !contentType.includes('application/json')) {
    return null;
  }

  // Try to parse JSON, return null if body is empty
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Assert unauthorized response (401)
 */
export async function expectUnauthorized(response: any) {
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.message).toBeDefined();
  return body;
}

/**
 * Assert forbidden response (403)
 */
export async function expectForbidden(response: any) {
  expect(response.status()).toBe(403);
  const body = await response.json();
  expect(body.message).toBeDefined();
  return body;
}

/**
 * Assert not found response (404)
 */
export async function expectNotFound(response: any) {
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body.message).toBeDefined();
  return body;
}

/**
 * Assert bad request response (400)
 */
export async function expectBadRequest(response: any) {
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.message).toBeDefined();
  return body;
}

/**
 * Validate UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate ISO date format
 */
export function isValidIsoDate(date: string): boolean {
  const isoDateRegex =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  return isoDateRegex.test(date) && !isNaN(Date.parse(date));
}
