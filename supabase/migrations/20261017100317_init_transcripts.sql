SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE EXTENSION "vector" SCHEMA "extensions";

CREATE TABLE "public"."interviews" (
  "id"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "slug"        text                     NOT NULL,
  "title"       text                     NOT NULL,
  "participant" text                     NOT NULL,
  "notice"      text,
  "profile"     jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "interviews_participant_check" CHECK ((participant <> ''::text)),
  CONSTRAINT "interviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "interviews_profile_check" CHECK ((jsonb_typeof(profile) = 'array'::text)),
  CONSTRAINT "interviews_slug_check" CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
  CONSTRAINT "interviews_slug_key" UNIQUE (slug),
  CONSTRAINT "interviews_title_check" CHECK ((title <> ''::text))
);

ALTER TABLE "public"."interviews"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."interviews" FROM "authenticated";

CREATE TABLE "public"."passages" (
  "id"              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "interview_id"    bigint                   NOT NULL,
  "position"        integer                  NOT NULL,
  "question"        text                     NOT NULL,
  "answer"          text                     NOT NULL,
  "content_hash"    text                     NOT NULL,
  "embedding_model" text                     NOT NULL,
  "embedding"       extensions.vector(1024)  NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "passages_answer_check" CHECK ((answer <> ''::text)),
  CONSTRAINT "passages_content_hash_check" CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "passages_embedding_model_check" CHECK ((embedding_model <> ''::text)),
  CONSTRAINT "passages_interview_id_position_key" UNIQUE (interview_id, "position"),
  CONSTRAINT "passages_pkey" PRIMARY KEY (id),
  CONSTRAINT "passages_position_check" CHECK (("position" > 0)),
  CONSTRAINT "passages_question_check" CHECK ((question <> ''::text))
);

ALTER TABLE "public"."passages"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."passages" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."interviews_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."interviews_id_seq" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."interviews_id_seq" FROM "service_role";

REVOKE ALL ON SEQUENCE "public"."passages_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."passages_id_seq" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."passages_id_seq" FROM "service_role";

ALTER TABLE "public"."passages"
  ADD CONSTRAINT "passages_interview_id_fkey" FOREIGN KEY (interview_id) REFERENCES public.interviews(id) ON DELETE CASCADE;

CREATE POLICY "Anyone can read interviews" ON "public"."interviews"
  FOR SELECT
  TO "anon"
  USING (true);

CREATE POLICY "Anyone can read passages" ON "public"."passages"
  FOR SELECT
  TO "anon"
  USING (true);

COMMENT ON EXTENSION "vector" IS 'vector data type and ivfflat and hnsw access methods';

REVOKE ALL ON TABLE "public"."interviews" FROM "anon";

REVOKE ALL ("id") ON TABLE "public"."interviews" FROM "anon";

GRANT SELECT ("id") ON TABLE "public"."interviews" TO "anon";

REVOKE ALL ("notice") ON TABLE "public"."interviews" FROM "anon";

GRANT SELECT ("notice") ON TABLE "public"."interviews" TO "anon";

REVOKE ALL ("participant") ON TABLE "public"."interviews" FROM "anon";

GRANT SELECT ("participant") ON TABLE "public"."interviews" TO "anon";

REVOKE ALL ("profile") ON TABLE "public"."interviews" FROM "anon";

GRANT SELECT ("profile") ON TABLE "public"."interviews" TO "anon";

REVOKE ALL ("slug") ON TABLE "public"."interviews" FROM "anon";

GRANT SELECT ("slug") ON TABLE "public"."interviews" TO "anon";

REVOKE ALL ("title") ON TABLE "public"."interviews" FROM "anon";

GRANT SELECT ("title") ON TABLE "public"."interviews" TO "anon";

REVOKE ALL ON TABLE "public"."interviews" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."interviews" TO "service_role";

REVOKE ALL ON TABLE "public"."passages" FROM "anon";

REVOKE ALL ("answer") ON TABLE "public"."passages" FROM "anon";

GRANT SELECT ("answer") ON TABLE "public"."passages" TO "anon";

REVOKE ALL ("id") ON TABLE "public"."passages" FROM "anon";

GRANT SELECT ("id") ON TABLE "public"."passages" TO "anon";

REVOKE ALL ("interview_id") ON TABLE "public"."passages" FROM "anon";

GRANT SELECT ("interview_id") ON TABLE "public"."passages" TO "anon";

REVOKE ALL ("position") ON TABLE "public"."passages" FROM "anon";

GRANT SELECT ("position") ON TABLE "public"."passages" TO "anon";

REVOKE ALL ("question") ON TABLE "public"."passages" FROM "anon";

GRANT SELECT ("question") ON TABLE "public"."passages" TO "anon";

REVOKE ALL ON TABLE "public"."passages" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."passages" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC;
