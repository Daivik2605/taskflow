// What a first sign-in creates (SPEC §2 "Seeding" and §2b): the tag tree, presets, the AEO Studio project, the two jobs,
// the counters and the default actions. Pure data + pure builders; seedRunner.ts writes it.
// An account created before revision 2 is migrated by supabase/taskflow_schema.sql to the same end state.
// Pay rate and pay-period anchor are deliberately NOT seeded: they stay null until Settings → Jobs (phase 6).

import type { TagKind } from './areas'

export interface SubTagSeed { name: string; emoji: string; color: string; app_key: string | null }
export interface TagSeed { name: string; kind: TagKind; emoji: string; color: string; children: SubTagSeed[] }
export interface PresetSeed { name: string; tag: string; default_minutes: number } // tag = "Parent/Sub"
export interface JobSeed { employer: string; tag: string }
export interface CounterSeed { name: string; emoji: string; color: string }
export interface ActionSeed { key: string; label: string }

const sub = (name: string, emoji: string, color: string, app_key: string | null = null): SubTagSeed => ({ name, emoji, color, app_key })

export const TAG_SEEDS: TagSeed[] = [
  { name: 'Work', kind: 'work', emoji: '💼', color: '#dc2626', children: [
    sub('Tim Hortons', '🍩', '#dc2626'), sub('Oland Stations', '⛽', '#f97316'), sub('Commute', '🚌', '#78716c')] },
  { name: 'Hustle', kind: 'hustle', emoji: '🚀', color: '#8b5cf6', children: [sub('AEO Studio', '🧠', '#8b5cf6')] },
  { name: 'Study', kind: 'study', emoji: '📚', color: '#6366f1', children: [
    sub('DSA', '🧩', '#6366f1', 'dsa'), sub('SQL', '🗄️', '#0ea5e9'), sub('Trading', '📈', '#10b981', 'trading'),
    sub('Tableau Data Analyst Certification', '📊', '#3b82f6'), sub('Databricks Data Analyst Certification', '🧱', '#ef4444')] },
  { name: 'Wellness', kind: 'wellness', emoji: '🧘', color: '#22c55e', children: [
    sub('Kriya', '🌬️', '#22c55e'), sub('Padmasadna', '🪷', '#14b8a6'), sub('Home Workout', '💪', '#ef4444'), sub('Gym', '🏋️', '#f97316')] },
  { name: 'Break', kind: 'break', emoji: '☕', color: '#f59e0b', children: [] },
  { name: 'Sleep', kind: 'sleep', emoji: '😴', color: '#64748b', children: [] },
  { name: 'Personal', kind: 'personal', emoji: '🏠', color: '#a3a3a3', children: [] },
]

export const PRESET_SEEDS: PresetSeed[] = [
  { name: 'Kriya', tag: 'Wellness/Kriya', default_minutes: 35 },
  { name: 'Padmasadna', tag: 'Wellness/Padmasadna', default_minutes: 20 },
]

export const PROJECT_SEED = { name: 'AEO Studio', tag: 'Hustle/AEO Studio', status: 'active' as const }

export const JOB_SEEDS: JobSeed[] = [
  { employer: 'Tim Hortons', tag: 'Work/Tim Hortons' },
  { employer: 'Oland Stations', tag: 'Work/Oland Stations' },
]

export const COUNTER_SEEDS: CounterSeed[] = [
  { name: 'Cigarette', emoji: '🚬', color: '#6b7280' },
  { name: 'Weed', emoji: '🌿', color: '#22c55e' },
]

/** Default pinned actions, in display order. Shift and preset keys embed row ids, so they're built after those rows exist. */
export function buildActions(jobs: { id: string; employer: string }[], presets: { id: string; name: string }[]): ActionSeed[] {
  return [
    ...jobs.map((j) => ({ key: `shift:${j.id}`, label: `${j.employer} shift` })),
    { key: 'nap_reset', label: 'Nap + reset' },
    ...presets.map((p) => ({ key: `preset:${p.id}`, label: p.name })),
    { key: 'sleep_checkin', label: 'Sleep check-in' },
  ]
}
