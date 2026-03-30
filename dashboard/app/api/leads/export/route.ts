import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const status = req.nextUrl.searchParams.get('status');

  let query = supabase
    .from('leads_bolt')
    .select('name, phone, project_type, objective, preferred_datetime, status, created_at')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: leads } = await query;

  if (!leads || leads.length === 0) {
    return new NextResponse('No hay leads para exportar', { status: 404 });
  }

  // Build CSV
  const headers = ['Nombre', 'Teléfono', 'Tipo de Proyecto', 'Objetivo', 'Horario Preferido', 'Estado', 'Fecha Creación'];
  const rows = leads.map(l => [
    l.name || '',
    l.phone || '',
    l.project_type || '',
    (l.objective || '').replace(/"/g, '""'),
    l.preferred_datetime || '',
    l.status || '',
    l.created_at || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${v}"`).join(',')),
  ].join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bolt-leads-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
