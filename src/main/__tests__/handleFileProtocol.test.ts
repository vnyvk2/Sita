import { describe, expect, it } from 'vitest';
import { handleFileProtocol } from '../handleFileProtocol';

describe('handleFileProtocol (SEC-01 Gate)', () => {
  it('returns HTTP 403 Forbidden with 0 bytes for localfiles host accessing C:/Windows/win.ini', async () => {
    const req = new Request('nora://localfiles/C:/Windows/win.ini');
    const res = await handleFileProtocol(req as unknown as GlobalRequest);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body.length).toBe(0);
  });

  it('returns HTTP 403 Forbidden with 0 bytes for thumb host accessing C:/Windows/win.ini', async () => {
    const req = new Request('nora://thumb/C:/Windows/win.ini');
    const res = await handleFileProtocol(req as unknown as GlobalRequest);
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body.length).toBe(0);
  });
});
