SET local check_function_bodies = off;

CREATE TABLE "public"."message_counts" (
  "visitor"  text    NOT NULL,
  "day"      date    NOT NULL,
  "messages" integer NOT NULL,
  CONSTRAINT "message_counts_messages_check" CHECK ((messages > 0)),
  CONSTRAINT "message_counts_pkey" PRIMARY KEY (visitor, day),
  CONSTRAINT "message_counts_visitor_check" CHECK ((visitor ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE "public"."message_counts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."message_counts" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.take_message (
  visitor_hash text,
  daily_limit  integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  today date := (now() at time zone 'utc')::date;
  counted integer;
begin
  if daily_limit is null or daily_limit < 1 then
    raise exception 'daily_limit must be at least 1' using errcode = '22023';
  end if;

  delete from public.message_counts where day < today;

  insert into public.message_counts as counts (visitor, day, messages)
  values (visitor_hash, today, 1)
  on conflict (visitor, day) do update
    set messages = counts.messages + 1
    where counts.messages < daily_limit
  returning counts.messages into counted;

  return counted is not null;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."take_message"(text, integer) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."take_message"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."take_message"(text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."take_message"(text, integer) TO "service_role";

REVOKE ALL ON TABLE "public"."message_counts" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."message_counts" TO "service_role";
