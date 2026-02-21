import { supabase } from '../lib/supabase'
import { DocumentFolder, DocumentTemplate, DocumentTemplateAssignment } from '../types'

export const documentService = {
  async getFolders(): Promise<DocumentFolder[]> {
    const { data, error } = await supabase
      .from('document_folders')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data || []
  },

  async createFolder(name: string) {
    const { data, error } = await supabase
      .from('document_folders')
      .insert([{ name: name.trim() }])
      .select('*')
      .single()

    return { data: data as DocumentFolder | null, error }
  },

  async updateFolder(id: string, name: string) {
    const { data, error } = await supabase
      .from('document_folders')
      .update({ name: name.trim() })
      .eq('id', id)
      .select('*')
      .single()

    return { data: data as DocumentFolder | null, error }
  },

  async deleteFolder(id: string) {
    const { error } = await supabase
      .from('document_folders')
      .delete()
      .eq('id', id)

    return { error }
  },

  async getTemplates(): Promise<DocumentTemplate[]> {
    const { data, error } = await supabase
      .from('document_templates')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data || []
  },

  async createTemplate(template: Pick<DocumentTemplate, 'title' | 'content' | 'folder_id'>) {
    const { data, error } = await supabase
      .from('document_templates')
      .insert([{
        title: template.title.trim(),
        content: template.content,
        folder_id: template.folder_id || null
      }])
      .select('*')
      .single()

    return { data: data as DocumentTemplate | null, error }
  },

  async updateTemplate(id: string, template: Partial<Pick<DocumentTemplate, 'title' | 'content' | 'folder_id'>>) {
    const payload: Record<string, unknown> = {}
    if (typeof template.title === 'string') payload.title = template.title.trim()
    if (typeof template.content === 'string') payload.content = template.content
    if ('folder_id' in template) payload.folder_id = template.folder_id || null

    const { data, error } = await supabase
      .from('document_templates')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    return { data: data as DocumentTemplate | null, error }
  },

  async deleteTemplate(id: string) {
    const { error } = await supabase
      .from('document_templates')
      .delete()
      .eq('id', id)

    return { error }
  },

  async getAssignments(): Promise<DocumentTemplateAssignment[]> {
    const { data, error } = await supabase
      .from('document_template_assignments')
      .select('*, patients(id, full_name)')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data || []
  },

  async assignTemplateToPatient(templateId: string, patientId: string) {
    const { data, error } = await supabase
      .from('document_template_assignments')
      .upsert(
        [{ template_id: templateId, patient_id: patientId }],
        { onConflict: 'template_id,patient_id', ignoreDuplicates: true }
      )
      .select('*, patients(id, full_name)')
      .single()

    return { data: data as DocumentTemplateAssignment | null, error }
  },

  async removeAssignment(assignmentId: string) {
    const { error } = await supabase
      .from('document_template_assignments')
      .delete()
      .eq('id', assignmentId)

    return { error }
  }
}
