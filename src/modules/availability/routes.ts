import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  listQuery,
  listTrialsQuery,
  removeParams,
  requestTrialBody,
  reviewTrialBody,
  reviewTrialParams,
  slotBody,
  updateBody,
  updateParams,
} from "./schemas";
import { createAvailabilityService } from "./service";

export function availabilityRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createAvailabilityService(db);
  return new Elysia()
    .get(
      "/api/availability",
      async ({ request, query }) => {
        return service.list(await actorFor(request), query);
      },
      { query: listQuery },
    )
    .post(
      "/api/availability",
      async ({ request, body, set }) => {
        const result = await service.create(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: slotBody },
    )
    .patch(
      "/api/availability/:id",
      async ({ request, params, body }) => {
        return service.update(await actorFor(request), params, body);
      },
      { params: updateParams, body: updateBody },
    )
    .delete(
      "/api/availability/:id",
      async ({ request, params }) => {
        return service.remove(await actorFor(request), params);
      },
      { params: removeParams },
    )
    .get(
      "/api/trial-requests",
      async ({ request, query }) => {
        return service.listTrials(await actorFor(request), query);
      },
      { query: listTrialsQuery },
    )
    .post(
      "/api/trial-requests",
      async ({ request, body, set }) => {
        const result = await service.requestTrial(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: requestTrialBody },
    )
    .patch(
      "/api/trial-requests/:id",
      async ({ request, params, body }) => {
        return service.reviewTrial(await actorFor(request), params, body);
      },
      { params: reviewTrialParams, body: reviewTrialBody },
    );
}
