-- Tipos do domínio. Ver docs/DATA-MODEL.md.
create type entry_kind      as enum ('expense', 'income');
create type entry_source    as enum ('manual', 'recurring', 'installment', 'goal');
create type recurrence_freq as enum ('monthly', 'weekly', 'yearly');
create type override_target as enum ('entry', 'recurring_rule', 'installment_plan', 'goal');
create type invite_status   as enum ('pending', 'accepted', 'revoked');
create type app_role        as enum ('admin', 'member');
