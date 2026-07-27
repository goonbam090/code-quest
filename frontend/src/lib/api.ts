import type { Problem, Progress, Submission } from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? '서버 요청에 실패했습니다.')
  return response.json()
}

export const api = {
  problems: (category: string) => request<Problem[]>(`/api/problems?category=${encodeURIComponent(category)}`),
  progress: (learnerKey: string) => request<Progress>(`/api/progress/${encodeURIComponent(learnerKey)}`),
  submit: (problem: Problem, learnerKey: string, answer: string) =>
    request<Submission>(`/api/problems/${problem.category}/${problem.number}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learnerKey, answer })
    })
}
