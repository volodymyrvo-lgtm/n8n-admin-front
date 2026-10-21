import { parseJobError } from './job-error.model';

describe('parseJobError', () => {
  it('pulls the well-known n8n fields out of the payload', () => {
    const parsed = parseJobError({
      message: 'missing ) after argument list',
      workflow: 'NEWCRM_PPLEN_SMS_Generation',
      failedNode: 'Resolve Onboarding Scenario2',
      executionId: '7014',
    });

    expect(parsed).toEqual({
      message: 'missing ) after argument list',
      workflow: 'NEWCRM_PPLEN_SMS_Generation',
      failedNode: 'Resolve Onboarding Scenario2',
      executionId: '7014',
      extra: [],
    });
  });

  it('keeps every other key as readable text, so nothing the workflow sent is lost', () => {
    const parsed = parseJobError({ key1: 'value', key2: 'value2', nested: { a: 1 }, count: 3 });

    expect(parsed.message).toBeNull();
    expect(parsed.extra).toEqual([
      { key: 'key1', value: 'value' },
      { key: 'key2', value: 'value2' },
      { key: 'nested', value: JSON.stringify({ a: 1 }, null, 2) },
      { key: 'count', value: '3' },
    ]);
  });

  it('turns a numeric execution id into text and treats empty known fields as missing', () => {
    const parsed = parseJobError({ executionId: 7014, workflow: '', failedNode: null });

    expect(parsed.executionId).toBe('7014');
    expect(parsed.workflow).toBeNull();
    expect(parsed.failedNode).toBeNull();
  });

  it('reads a plain string as the message and an empty or missing error as nothing', () => {
    expect(parseJobError('boom').message).toBe('boom');
    expect(parseJobError(42).message).toBe('42');
    expect(parseJobError(null)).toEqual({ message: null, workflow: null, failedNode: null, executionId: null, extra: [] });
    expect(parseJobError(undefined).message).toBeNull();
    expect(parseJobError('').message).toBeNull();
  });
});
