Necesitamos crear un módulo en Admin llamado “Calculation Debugger”, dentro de Admin submenu Configuración

Objetivo:
Permitir que un usuario describa un problema de cálculo de incentivos y que el sistema investigue el origen probable comparando la data original, filtros de territorio, producto, cuentas, pay components, drill down, overrides y resultado final.

Requerimientos:

1. Crear una nueva vista en Admin:
   - Título: Calculation Debugger
   - Formulario con campos:
     - period - select desde sales_force_status.period_month
     - territory/name - select desde select desde sales_force_status.territorio_individual  o sales_force_status.nombre_completo

    ** con period y territory , ya podemos saber que sales_force_status.team_id  y otros componentes de sales_force_status
    al saber su team_id ya podemos buscar en team_rule_definitions por team_id y posteriormente en  team_rule_definition_items

     - product - select desde team_rule_definition_items.product_name
     - expectedValue
     - actualValue
     - description
   - Botón “Investigar”


   Yo creo que aqui podemos seguir el flujo que tenemos en components\admin\calculo-process-runner.tsx


   - Área de resultado con:
     - resumen del diagnóstico detallado, incluyendo los pasos que se estan siguiendo, de donde vienen etc
     - diferencia detectada
     - origen probable
     - evidencia
     - acción sugerida
     - trace técnico en JSON colapsable

2. Crear tabla Supabase public.admin_bug_reports:
   - id uuid primary key default gen_random_uuid()
   - title text
   - description text not null
   - period text
   - representative_name text
   - product text
   - metric text
   - expected_value numeric
   - actual_value numeric
   - difference numeric
   - status text default 'open'
   - priority text default 'normal'
   - created_by uuid
   - created_by_email text
   - created_at timestamptz default now()
   - updated_at timestamptz default now()

3. Crear tabla public.admin_bug_diagnoses:
   - id uuid primary key default gen_random_uuid()
   - bug_report_id uuid references public.admin_bug_reports(id) on delete cascade
   - diagnosis_summary text
   - suspected_cause text
   - recommended_fix text
   - confidence_score numeric
   - trace_data jsonb
   - ai_response text
   - created_at timestamptz default now()

4. Crear una API route:
   POST /api/admin/find-bugs

   Recibe:
   {
     period,
     representativeName,
     product,
     metric,
     expectedValue,
     actualValue,
     description
   }

   Debe:
   - guardar el reporte en admin_bug_reports
   - ejecutar traceCalculation()
   - generar un diagnóstico inicial determinístico
   - opcionalmente llamar a IA para redactar explicación
   - guardar el diagnóstico en admin_bug_diagnoses
   - devolver el diagnóstico al frontend

5. Crear función traceCalculation():
   Debe intentar reconstruir el cálculo del resultado final:
   - buscar representante
   - buscar territorio asignado
   - buscar cuentas asignadas
   - buscar ventas originales del producto
   - aplicar filtros reales usados por la calculadora
   - comparar con expectedValue
   - identificar filas incluidas que expliquen la diferencia
   - revisar overrides
   - revisar pay components
   - revisar drill down
   - devolver trace_data estructurado

6. Importante:
   La IA no debe ejecutar SQL libre ni modificar datos.
   Solo puede recibir datos ya consultados por funciones controladas.
   Las correcciones deben ser sugeridas, no aplicadas automáticamente.

7. La primera versión puede trabajar sin IA:
   Si todavía no está conectada la IA, devolver un diagnóstico determinístico basado en diferencia, filtros y filas incluidas.