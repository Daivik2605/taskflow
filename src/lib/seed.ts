// What a first sign-in creates (SPEC §2 "Seeding" and §2b): the tag tree, presets, the AEO Studio project, the two jobs,
// the counters and the default actions. Pure data + pure builders; seedRunner.ts writes it.
// An account created before revision 2 is migrated by supabase/taskflow_schema.sql to the same end state.
// Pay rate and pay-period anchor are deliberately NOT seeded: they stay null until Settings → Jobs (phase 6).

import type { TagKind } from './areas'

export interface SubTagSeed { name: string; color: string; app_key: string | null; show_for_tasks: boolean }
export interface TagSeed { name: string; kind: TagKind; color: string; show_for_tasks: boolean; children: SubTagSeed[] }
export interface PresetSeed { name: string; tag: string; default_minutes: number } // tag = "Parent/Sub"
export interface JobSeed { employer: string; tag: string }
export interface CounterSeed { name: string; short_label: string; color: string }
export interface ActionSeed { key: string; label: string }

// show_for_tasks = offered in the task sheet and quick add (SPEC §2b revision 4)
const sub = (name: string, color: string, show_for_tasks = false, app_key: string | null = null): SubTagSeed => ({ name, color, app_key, show_for_tasks })

export const TAG_SEEDS: TagSeed[] = [
  { name: 'Work', kind: 'work', color: '#dc2626', show_for_tasks: false, children: [
    sub('Tim Hortons', '#dc2626'), sub('Oland Stations', '#f97316', true), sub('Commute', '#78716c', true)] },
  { name: 'Hustle', kind: 'hustle', color: '#8b5cf6', show_for_tasks: false, children: [sub('AEO Studio', '#8b5cf6', true), sub('Projects', '#a78bfa', true)] },
  { name: 'Study', kind: 'study', color: '#6366f1', show_for_tasks: true, children: [
    sub('DSA', '#6366f1', false, 'dsa'), sub('SQL', '#0ea5e9'), sub('Trading', '#10b981', true, 'trading'),
    sub('Tableau Data Analyst Certification', '#3b82f6'), sub('Databricks Data Analyst Certification', '#ef4444')] },
  { name: 'Wellness', kind: 'wellness', color: '#22c55e', show_for_tasks: false, children: [
    sub('Kriya', '#22c55e'), sub('Padmasadna', '#14b8a6'), sub('Home Workout', '#ef4444'), sub('Gym', '#f97316')] },
  { name: 'Break', kind: 'break', color: '#f59e0b', show_for_tasks: false, children: [] },
  { name: 'Sleep', kind: 'sleep', color: '#64748b', show_for_tasks: false, children: [] },
  { name: 'Personal', kind: 'personal', color: '#a3a3a3', show_for_tasks: false, children: [] },
]

export const PRESET_SEEDS: PresetSeed[] = [
  { name: 'Kriya', tag: 'Wellness/Kriya', default_minutes: 35 },
  { name: 'Padmasadna', tag: 'Wellness/Padmasadna', default_minutes: 20 },
  { name: 'Home Workout', tag: 'Wellness/Home Workout', default_minutes: 30 },
  { name: 'Gym', tag: 'Wellness/Gym', default_minutes: 60 },
]

export const PROJECT_SEED = { name: 'AEO Studio', tag: 'Hustle/AEO Studio', status: 'active' as const }

export const JOB_SEEDS: JobSeed[] = [
  { employer: 'Tim Hortons', tag: 'Work/Tim Hortons' },
  { employer: 'Oland Stations', tag: 'Work/Oland Stations' },
]

export const COUNTER_SEEDS: CounterSeed[] = [
  { name: 'Cigarette', short_label: 'Cig', color: '#6b7280' },
  { name: 'Weed', short_label: 'Weed', color: '#22c55e' },
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
