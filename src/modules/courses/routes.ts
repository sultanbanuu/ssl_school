import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  createCourseBody,
  listQuery,
} from "./schemas";
import { createCourseService } from "./service";

const syllabusFiles = {
  "sayad.pdf": new URL("./syllabi/sayad.pdf", import.meta.url),
  "sultanbanu.pdf": new URL("./syllabi/sultanbanu.pdf", import.meta.url),
  "lean-leader.pdf": new URL("./syllabi/lean-leader.pdf", import.meta.url),
};

export function courseRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createCourseService(db);
  return new Elysia()
    .get("/api/courses/syllabi/:file", ({ params, status }) => {
      if (!Object.hasOwn(syllabusFiles, params.file))
        return status(404, "Syllabus not found");

      const file = params.file as keyof typeof syllabusFiles;
      return new Response(Bun.file(syllabusFiles[file], { type: "application/pdf" }), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${file}"`,
        },
      });
    })
    .get(
      "/api/courses",
      async ({ request, query }) => {
        return service.list(await actorFor(request), query);
      },
      { query: listQuery },
    )
    .post(
      "/api/courses",
      async ({ request, body, set }) => {
        const result = await service.create(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createCourseBody },
    );
}
