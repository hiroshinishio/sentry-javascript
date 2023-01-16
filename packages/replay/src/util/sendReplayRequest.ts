import { getCurrentHub } from '@sentry/core';
import type { ReplayEvent, TransportMakeRequestResponse } from '@sentry/types';
import type { RateLimits } from '@sentry/utils';
import { isRateLimited, logger, updateRateLimits } from '@sentry/utils';

import { REPLAY_EVENT_NAME, UNABLE_TO_SEND_REPLAY } from '../constants';
import type { SendReplayData } from '../types';
import { createReplayEnvelope } from './createReplayEnvelope';
import { prepareRecordingData } from './prepareRecordingData';
import { prepareReplayEvent } from './prepareReplayEvent';

/**
 * Send replay attachment using `fetch()`
 */
export async function sendReplayRequest({
  recordingData,
  replayId,
  segmentId: segment_id,
  includeReplayStartTimestamp,
  eventContext,
  timestamp,
  session,
  options,
}: SendReplayData): Promise<void | TransportMakeRequestResponse> {
  const preparedRecordingData = prepareRecordingData({
    recordingData,
    headers: {
      segment_id,
    },
  });

  const { urls, errorIds, traceIds, initialTimestamp } = eventContext;

  const hub = getCurrentHub();
  const client = hub.getClient();
  const scope = hub.getScope();
  const transport = client && client.getTransport();
  const dsn = client?.getDsn();

  if (!client || !scope || !transport || !dsn || !session.sampled) {
    return;
  }

  const baseEvent: ReplayEvent = {
    // @ts-ignore private api
    type: REPLAY_EVENT_NAME,
    ...(includeReplayStartTimestamp ? { replay_start_timestamp: initialTimestamp / 1000 } : {}),
    timestamp: timestamp / 1000,
    error_ids: errorIds,
    trace_ids: traceIds,
    urls,
    replay_id: replayId,
    segment_id,
    replay_type: session.sampled,
  };

  const replayEvent = await prepareReplayEvent({ scope, client, replayId, event: baseEvent });

  if (!replayEvent) {
    // Taken from baseclient's `_processEvent` method, where this is handled for errors/transactions
    client.recordDroppedEvent('event_processor', 'replay_event', baseEvent);
    __DEBUG_BUILD__ && logger.log('An event processor returned `null`, will not send event.');
    return;
  }

  replayEvent.tags = {
    ...replayEvent.tags,
    sessionSampleRate: options.sessionSampleRate,
    errorSampleRate: options.errorSampleRate,
  };

  /*
  For reference, the fully built event looks something like this:
  {
      "type": "replay_event",
      "timestamp": 1670837008.634,
      "error_ids": [
          "errorId"
      ],
      "trace_ids": [
          "traceId"
      ],
      "urls": [
          "https://example.com"
      ],
      "replay_id": "eventId",
      "segment_id": 3,
      "replay_type": "error",
      "platform": "javascript",
      "event_id": "eventId",
      "environment": "production",
      "sdk": {
          "integrations": [
              "BrowserTracing",
              "Replay"
          ],
          "name": "sentry.javascript.browser",
          "version": "7.25.0"
      },
      "sdkProcessingMetadata": {},
      "tags": {
          "sessionSampleRate": 1,
          "errorSampleRate": 0,
      }
  }
  */

  const envelope = createReplayEnvelope(replayEvent, preparedRecordingData, dsn, client.getOptions().tunnel);

  let response: void | TransportMakeRequestResponse;

  try {
    response = await transport.send(envelope);
  } catch {
    throw new Error(UNABLE_TO_SEND_REPLAY);
  }

  // TODO (v8): we can remove this guard once transport.send's type signature doesn't include void anymore
  if (response) {
    const rateLimits = updateRateLimits({}, response);
    if (isRateLimited(rateLimits, 'replay')) {
      throw new RateLimitError(rateLimits);
    }
  }
  return response;
}

/**
 * This error indicates that we hit a rate limit API error.
 */
export class RateLimitError extends Error {
  public rateLimits: RateLimits;

  public constructor(rateLimits: RateLimits) {
    super('Rate limit hit');
    this.rateLimits = rateLimits;
  }
}