import { useCallback, useEffect, useState } from 'react'

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  dashboard: () => request('/dashboard'),
  bills: (params = {}) => request(`/bills?${new URLSearchParams(params)}`),
  payBill: (id) => request(`/bills/${id}/pay`, { method: 'POST' }),
  predictions: () => request('/predictions'),
  updateBudget: (category, monthly_limit) =>
    request(`/budgets/${category}`, { method: 'PUT', body: { monthly_limit } }),
  splits: () => request('/splits'),
  splitBill: (groupId, bill_id, member_ids) =>
    request(`/splits/${groupId}/bills`, { method: 'POST', body: { bill_id, member_ids } }),
  settleShare: (shareId) => request(`/splits/shares/${shareId}/settle`, { method: 'POST' }),

  // modul harta furnizorilor
  catalog: () => request('/catalog'),
  localities: (county) => request(`/catalog/localities/${county}`),
  addAccount: (body) => request('/accounts', { method: 'POST', body }),
  createContract: (body) => request('/contracts', { method: 'POST', body }),
}

/** const { data, loading, error, reload, setData } = useApi(api.dashboard) */
export function useApi(fn) {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  const reload = useCallback(() => {
    return fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState((s) => ({ ...s, loading: false, error })))
  }, [fn])

  useEffect(() => {
    reload()
  }, [reload])

  const setData = (data) => setState((s) => ({ ...s, data }))
  return { ...state, reload, setData }
}
