/**
 * Canonical-state semantics.
 *
 * Three orthogonal questions, three fields, deliberately not collapsed:
 *   evidence_type      - what kind of evidence is this?
 *   canonical_state    - what role does this value play in current state?
 *   verification_state - has anyone outside this model confirmed it?
 *
 * A planning assumption can be the accepted canonical value. A verified
 * document can later be superseded. Two externally verified sources can
 * conflict. The vocabulary and validation rules live in data/canonical-state.json
 * so the semantics are inspectable rather than buried in code.
 */

const CONTESTED = new Set(['unresolved', 'conflicting_sources']);

const vocab = (project) => project.canonicalState;

export function commitmentSafe(project, node) {
  return vocab(project).commitment_safe_states.includes(node.canonical_state);
}

/** Every node in the data set that carries a canonical_state, in one shape. */
export function stateNodes(project) {
  const nodes = [];

  for (const record of project.canonical.records) {
    nodes.push({
      kind: 'canonical_record',
      id: record.id,
      label: record.subject,
      canonical_value: record.canonical_value ?? null,
      canonical_state: record.canonical_state,
      evidence_type: record.evidence_type ?? null,
      verification_state: record.verification_state ?? null,
      resolution_required: record.resolution_required ?? null,
      sources: record.sources ?? [],
      superseded_by: record.superseded_by ?? null,
      resolution_reason: record.resolution_reason ?? null,
      raw: record,
    });
    for (const [index, conflict] of (record.conflicts ?? []).entries()) {
      nodes.push({
        kind: 'conflict_entry',
        id: `${record.id}#conflict:${index}`,
        label: `${record.subject} - competing value from ${conflict.source}`,
        canonical_value: conflict.value ?? null,
        canonical_state: conflict.canonical_state,
        evidence_type: conflict.evidence_type ?? null,
        verification_state: conflict.verification_state ?? null,
        resolution_required: conflict.resolution_required ?? null,
        sources: [],
        superseded_by: conflict.superseded_by ?? null,
        resolution_reason: conflict.resolution_reason ?? null,
        parent: record.id,
        raw: conflict,
      });
    }
  }

  for (const item of project.contradictions.items) {
    nodes.push({
      kind: 'contradiction',
      id: item.id,
      label: item.topic,
      canonical_value: item.canonical_record ? undefined : null,
      canonical_state: item.canonical_state,
      evidence_type: null,
      verification_state: null,
      resolution_required: item.resolution_required ?? null,
      sources: [],
      superseded_by: item.superseded_by ?? null,
      resolution_reason: item.resolution_reason ?? null,
      raw: item,
    });
  }

  for (const assumption of project.assumptions.values()) {
    nodes.push({
      kind: 'assumption',
      id: assumption.id,
      label: assumption.label,
      canonical_value: assumption.value ?? null,
      canonical_state: assumption.canonical_state,
      evidence_type: assumption.evidence_type,
      verification_state: assumption.verification_state ?? null,
      resolution_required: null,
      sources: [],
      superseded_by: null,
      resolution_reason: null,
      raw: assumption,
    });
  }

  return nodes;
}

/** Enforces the rules recorded in canonical-state.json. Returns [] when clean. */
export function validateCanonical(project) {
  const v = vocab(project);
  const states = Object.keys(v.canonical_state.values);
  const evidence = Object.keys(v.evidence_type.values);
  const verification = Object.keys(v.verification_state.values);
  const resolutions = Object.keys(v.resolution_required.values);
  const violations = [];
  const fail = (node, rule, detail) => violations.push({ id: node.id, kind: node.kind, rule, detail });

  for (const node of stateNodes(project)) {
    if (!node.canonical_state) {
      fail(node, 'rule.state_required', 'No canonical_state recorded.');
      continue;
    }
    if (!states.includes(node.canonical_state)) {
      fail(node, 'rule.known_state', `Unknown canonical_state "${node.canonical_state}".`);
      continue;
    }
    if (node.evidence_type && !evidence.includes(node.evidence_type)) {
      fail(node, 'rule.known_evidence_type', `Unknown evidence_type "${node.evidence_type}".`);
    }
    if (node.verification_state && !verification.includes(node.verification_state)) {
      fail(node, 'rule.known_verification_state', `Unknown verification_state "${node.verification_state}".`);
    }
    if (node.resolution_required && !resolutions.includes(node.resolution_required)) {
      fail(node, 'rule.known_resolution', `Unknown resolution_required "${node.resolution_required}".`);
    }

    // Contradiction rows describe a sheet record rather than carrying a value.
    const carriesValue = node.canonical_value !== undefined;

    if (node.canonical_state === 'confirmed' && carriesValue && node.canonical_value === null) {
      fail(node, 'rule.confirmed_has_value', 'Confirmed but no canonical_value.');
    }
    if (node.canonical_state === 'unresolved') {
      if (carriesValue && node.canonical_value !== null) {
        fail(node, 'rule.unresolved_has_no_value', 'Unresolved but a canonical_value is set.');
      }
      if (!node.resolution_required) {
        fail(node, 'rule.unresolved_has_no_value', 'Unresolved without resolution_required.');
      }
    }
    if (node.canonical_state === 'conflicting_sources') {
      if (carriesValue && node.canonical_value !== null) {
        fail(node, 'rule.conflict_has_no_value', 'Conflicting sources but a canonical_value is set.');
      }
      if (!node.resolution_required) {
        fail(node, 'rule.conflict_has_no_value', 'Conflicting sources without resolution_required.');
      }
      if (node.kind === 'canonical_record' && node.sources.length < 2) {
        fail(node, 'rule.conflict_has_no_value', 'Conflicting sources with fewer than two sources recorded.');
      }
    }
    if (node.canonical_state === 'superseded') {
      if (!node.superseded_by) fail(node, 'rule.superseded_points_forward', 'Superseded without superseded_by.');
      if (!node.resolution_reason) fail(node, 'rule.superseded_points_forward', 'Superseded without resolution_reason.');
    }
  }

  // A retired value must never be presented as an open decision.
  for (const item of pendingResolution(project)) {
    if (item.canonical_state === 'superseded') {
      fail(item, 'rule.superseded_is_not_open', 'A superseded record reached the pending-resolution queue.');
    }
  }

  return violations;
}

/** What still needs a human, an outside party, or more evidence. */
export function pendingResolution(project) {
  return stateNodes(project)
    .filter((node) => node.kind !== 'assumption' && CONTESTED.has(node.canonical_state))
    // A contradiction row that delegates to a canonical record is a view onto
    // it, not a second open item. List the record, not both.
    .filter((node) => !(node.kind === 'contradiction' && node.raw.canonical_record))
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      canonical_state: node.canonical_state,
      resolution_required: node.resolution_required,
      resolution_rule: node.raw.resolution_rule ?? node.raw.sheet_action ?? null,
      blocks_gates: node.raw.blocks_gates ?? [],
      question_id: node.raw.question_id ?? null,
      sources: node.sources,
    }));
}

/** Settled history: values that were once current and have been replaced. */
export function supersededHistory(project) {
  return stateNodes(project)
    .filter((node) => node.canonical_state === 'superseded')
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      value: node.canonical_value,
      superseded_by: node.superseded_by,
      reason: node.resolution_reason,
    }));
}

export function decisionsFor(project, subject) {
  return project.decisions.decisions.filter((decision) => decision.subject === subject);
}

/**
 * "Why does the model currently believe this?" for a canonical record,
 * an assumption, or a contradiction row.
 */
export function explain(project, id) {
  const node = stateNodes(project).find((candidate) => candidate.id === id);
  if (!node) {
    const known = stateNodes(project).map((n) => n.id);
    throw new Error(`No record with id "${id}". Try one of: ${known.slice(0, 8).join(', ')} ...`);
  }

  const record = node.raw;
  const decisions = decisionsFor(project, node.id);
  const conflicts = node.kind === 'canonical_record' ? (record.conflicts ?? []) : [];

  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    belief: node.canonical_value === null
      ? 'No canonical value. The model deliberately believes nothing here.'
      : node.canonical_value,
    canonical_state: node.canonical_state,
    evidence_type: node.evidence_type,
    verification_state: node.verification_state,
    commitment_safe: commitmentSafe(project, node),
    resolution_required: node.resolution_required,
    resolution_rule: record.resolution_rule ?? null,
    sources: node.sources,
    conflicts,
    decisions,
    blocks_gates: record.blocks_gates ?? [],
    refresh_rule: record.refresh_rule ?? null,
    last_verified: record.last_verified ?? null,
    detail: record.detail ?? null,
    review_after: record.review_after ?? decisions.find((d) => d.review_after)?.review_after ?? null,
    sheet_action: record.sheet_action ?? null,
    notes: [record.requisition_note, record.lean_note, record.merge_rule].filter(Boolean),
  };
}
