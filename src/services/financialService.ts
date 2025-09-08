import { supabase } from '../lib/supabase'
import { FinancialRecord } from '../types'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'

export const financialService = {
  async getFinancialRecords(): Promise<FinancialRecord[]> {
    const { data, error } = await supabase
      .from('financial_records')
      .select(`
        *,
        patients (
          id,
          full_name
        )
      `)
      .order('transaction_date', { ascending: false })

    if (error) {
      console.error('Error fetching financial records:', error)
      return []
    }

    return data || []
  },

  async getWeeklyRevenue(): Promise<number> {
    const startDate = format(startOfWeek(new Date()), 'yyyy-MM-dd')
    const endDate = format(endOfWeek(new Date()), 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('financial_records')
      .select('amount')
      .eq('transaction_type', 'income')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)

    if (error) {
      console.error('Error fetching weekly revenue:', error)
      return 0
    }

    return data?.reduce((total, record) => total + Number(record.amount), 0) || 0
  },

  async getMonthlyRevenue(): Promise<number> {
    const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('financial_records')
      .select('amount')
      .eq('transaction_type', 'income')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)

    if (error) {
      console.error('Error fetching monthly revenue:', error)
      return 0
    }

    return data?.reduce((total, record) => total + Number(record.amount), 0) || 0
  },

  async createFinancialRecord(recordData: {
    transaction_type: 'income' | 'expense'
    patient_id?: string
    session_id?: string
    amount: number
    description?: string
    payment_method: string
    transaction_date: string
    category?: string
  }) {
    console.log('Creating financial record with data:', recordData)
    
    const { data, error } = await supabase
      .from('financial_records')
      .insert([recordData])
      .select(`
        *,
        patients (
          id,
          full_name
        )
      `)
      .single()

    if (error) {
      console.error('Error creating financial record:', error)
      console.error('Error details:', error.details)
      console.error('Error hint:', error.hint)
      console.error('Error message:', error.message)
    }

    return { data, error }
  },

  async updateFinancialRecord(id: string, updates: Partial<FinancialRecord>) {
    // Remove readonly fields
    const { id: recordId, created_at, patients, user_id, ...updateData } = updates
    
    const { data, error } = await supabase
      .from('financial_records')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        patients (
          id,
          full_name
        )
      `)
      .single()

    if (error) {
      console.error('Error updating financial record:', error)
    }

    return { data, error }
  },

  async deleteFinancialRecord(id: string) {
    const { error } = await supabase
      .from('financial_records')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting financial record:', error)
    }

    return { error }
  }
}