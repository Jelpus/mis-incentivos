import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";

type SalesForceTeamRow = {
  team_id: string | null;
};

type TeamRuleDefinitionRow = { id: string; team_id: string | null };
type TeamRuleDefinitionItemRow = { rule_code: string | null; product_name: string | null };

export async function GET(request: Request) {
  const auth = await getCurrentAuthContext();
  const { user, role, actorRole, isActive } = auth;

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const hasAdminAccess =
    role === "admin" || role === "super_admin" || actorRole === "admin" || actorRole === "super_admin";
  if (!hasAdminAccess) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodInput = String(searchParams.get("period") ?? "").trim();
  const scopeType = String(searchParams.get("scopeType") ?? "").trim();
  const scopeValue = String(searchParams.get("scopeValue") ?? "").trim();

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return NextResponse.json({ error: "Periodo invalido." }, { status: 400 });
  }

  if (!["linea", "team_id", "representante"].includes(scopeType)) {
    return NextResponse.json({ error: "scopeType invalido." }, { status: 400 });
  }

  if (!scopeValue) {
    return NextResponse.json({ data: { rules: [] } });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ data: { rules: [] } });
  }

  try {
    let teamIds: string[] = [];

    if (scopeType === "representante") {
      const representativeResult = await supabase
        .from("sales_force_status")
        .select("team_id")
        .eq("period_month", periodMonth)
        .eq("is_deleted", false)
        .eq("territorio_individual", scopeValue)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<SalesForceTeamRow>();

      if (representativeResult.error) {
        return NextResponse.json({ data: { rules: [] } });
      }

      const teamId = String(representativeResult.data?.team_id ?? "").trim();
      if (!teamId) return NextResponse.json({ data: { rules: [] } });
      teamIds = [teamId];
    } else if (scopeType === "linea") {
      const lineaTeamsResult = await supabase
        .from("sales_force_status")
        .select("team_id")
        .eq("period_month", periodMonth)
        .eq("is_deleted", false)
        .eq("linea_principal", scopeValue);

      if (lineaTeamsResult.error) {
        return NextResponse.json({ data: { rules: [] } });
      }

      teamIds = Array.from(
        new Set(
          ((lineaTeamsResult.data ?? []) as SalesForceTeamRow[])
            .map((row) => String(row.team_id ?? "").trim())
            .filter((value) => value.length > 0),
        ),
      );
    } else {
      const teamId = scopeValue.trim();
      if (!teamId) return NextResponse.json({ data: { rules: [] } });
      teamIds = [teamId];
    }

    if (!teamIds.length) {
      return NextResponse.json({ data: { rules: [] } });
    }

    const definitionsResult = await supabase
      .from("team_rule_definitions")
      .select("id, team_id")
      .eq("period_month", periodMonth)
      .in("team_id", teamIds);
    if (definitionsResult.error) {
      return NextResponse.json({ data: { rules: [] } });
    }

    const definitions = (definitionsResult.data ?? []) as TeamRuleDefinitionRow[];
    const definitionIds = Array.from(
      new Set(
        definitions
          .map((row) => String(row.id ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );
    if (!definitionIds.length) {
      return NextResponse.json({ data: { rules: [] } });
    }

    const normalizedTeams = new Set(
      teamIds.map((team) => team.trim().toUpperCase()).filter((value) => value.length > 0),
    );

    const itemsResult = await supabase
      .from("team_rule_definition_items")
      .select("rule_code, product_name")
      .in("definition_id", definitionIds);
    if (itemsResult.error) {
      return NextResponse.json({ data: { rules: [] } });
    }

    const rules = Array.from(
      new Set(
        ((itemsResult.data ?? []) as TeamRuleDefinitionItemRow[])
          .filter((row) => {
            const productName = String(row.product_name ?? "").trim();
            if (!productName) return false;
            const ruleCode = String(row.rule_code ?? "").trim().toUpperCase();
            if (!ruleCode) return false;
            for (const team of normalizedTeams) {
              if (ruleCode.includes(team)) return true;
            }
            return false;
          })
          .map((row) => String(row.product_name ?? "").trim()),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ data: { rules } });
  } catch {
    return NextResponse.json({ data: { rules: [] } });
  }
}
