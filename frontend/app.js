(function () {
  const defaultTickets = [
    {
      id: "SV-1208",
      customer: "Northgate Mall",
      subject: "Camera offline — not connecting to NVR",
      priority: "high",
      status: "open",
      queue: "Enterprise",
      owner: "",
      receivedAt: "08:14",
      body: "Camera #12 in the east hallway has been offline since yesterday. The PoE switch shows link activity but the camera does not appear in the NVR. No network changes were made.",
      promotedToDataset: true
    },
    {
      id: "SV-1216",
      customer: "Harbor Point HOA",
      subject: "Night vision not working on outdoor cameras",
      priority: "medium",
      status: "open",
      queue: "Field ops",
      owner: "",
      receivedAt: "08:42",
      body: "Three outdoor cameras are not switching to IR night mode after dark. The footage is completely black from 7 PM onwards. Daytime video is fine. Firmware version 4.2.8.",
      promotedToDataset: true
    },
    {
      id: "SV-1229",
      customer: "Lakeview Logistics",
      subject: "Motion detection sending too many false alerts",
      priority: "medium",
      status: "open",
      queue: "Alert tuning",
      owner: "",
      receivedAt: "09:05",
      body: "Perimeter cameras are sending hundreds of false motion alerts per day. Wind-blown trees and shadows keep triggering notifications. We adjusted sensitivity to 60% but it did not help.",
      promotedToDataset: true
    },
    {
      id: "SV-1241",
      customer: "Ironwood Casino",
      subject: "NVR storage full — recording stopped",
      priority: "high",
      status: "assigned",
      queue: "Recording",
      owner: "Platform support",
      receivedAt: "09:31",
      body: "Our NVR ran out of storage and recording stopped on all 16 channels. Getting \"disk full\" errors. Old footage is not being auto-deleted despite 30-day retention policy. Need recording restored ASAP.",
      promotedToDataset: true
    },
    {
      id: "SV-1255",
      customer: "Westbrook Campus",
      subject: "How to update firmware on all cameras at once?",
      priority: "low",
      status: "in_progress",
      queue: "How-to",
      owner: "Customer success",
      receivedAt: "10:02",
      body: "We have 24 cameras on firmware 4.1.x and need to update to 4.3.2. Is there a batch update option? Will cameras go offline during the update? How long per camera?",
      promotedToDataset: true
    }
  ];

  const knowledgeBase = [
    {
      title: "Camera offline troubleshooting checklist",
      category: "incident",
      triggers: ["camera", "offline", "nvr", "not connecting", "link activity", "network"],
      answer: "Confirm PoE and link lights, validate the camera still resolves in the recorder, and escalate with one exact timestamp plus switch context if it remains offline."
    },
    {
      title: "Night image and IR recovery path",
      category: "vision",
      triggers: ["night vision", "ir", "dark", "black", "footage", "image"],
      answer: "Verify the day/night schedule, IR cutover mode, and scene lighting first, then route to camera support if night footage still fails after a settings check."
    },
    {
      title: "Recording and storage recovery runbook",
      category: "recording",
      triggers: ["recording", "storage", "disk full", "retention", "footage", "channels"],
      answer: "Check retention cleanup, confirm recorder disk health, and restore recording before moving to firmware or policy questions."
    },
    {
      title: "Camera configuration and firmware guidance",
      category: "config",
      triggers: ["firmware", "update", "motion", "alerts", "sensitivity", "batch"],
      answer: "Treat this as a configuration path: explain the supported batch update or tuning sequence, then route to customer success or solutions if rollout help is needed."
    }
  ];

  const TICKET_STORE_KEY = "aiWorkflowRebuild.ticketStore.v1";
  const DATASET_STORE_KEY = "aiWorkflowRebuild.datasetStore.v1";
  const PICKED_UP_STATUSES = new Set(["claimed", "assigned", "in_progress"]);

  const seededDatasetEntries = defaultTickets.map((ticket, index) => ({
    ...clone(ticket),
    storeTicketId: ticket.id,
    savedAt: [
      "2026-05-14T09:12:00",
      "2026-05-14T09:48:00",
      "2026-05-14T10:11:00",
      "2026-05-14T10:36:00",
      "2026-05-14T11:04:00"
    ][index],
    source: ["legacy mock", "legacy mock", "legacy mock", "legacy mock", "legacy mock"][index]
  }));

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(text) {
    return String(text || "").trim().toLowerCase();
  }

  function parseRuleList(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  function scoreKeywordHits(text, terms) {
    return terms.reduce((count, term) => (text.includes(term) ? count + 1 : count), 0);
  }

  function normalizeTicketStatus(status) {
    const value = normalize(status);
    if (!value) return "open";
    if (["open", "claimed", "assigned", "in_progress", "resolved", "closed", "archived"].includes(value)) {
      return value;
    }
    if (/\b(needs|ready|review|guidance|tuning)\b/.test(value)) return "open";
    if (/\b(assign|owner|picked up)\b/.test(value)) return "assigned";
    return "open";
  }

  function loadStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : clone(fallback);
    } catch (_) {
      return clone(fallback);
    }
  }

  function hydrateTicketEntry(entry, index) {
    return {
      ...clone(entry),
      customer: entry.customer || entry.account || `Account ${index + 1}`,
      subject: entry.subject || "Untitled case",
      priority: normalize(entry.priority) || "medium",
      queue: entry.queue || "General",
      body: entry.body || "",
      status: normalizeTicketStatus(entry.status),
      owner: entry.owner || "",
      receivedAt: entry.receivedAt || "09:00",
      id: entry.id || `SV-${1200 + index}`,
      promotedToDataset: !!entry.promotedToDataset
    };
  }

  function hydrateDatasetEntry(entry, index) {
    return {
      ...hydrateTicketEntry(entry, index),
      savedAt: entry.savedAt || new Date(Date.now() - index * 36e5).toISOString(),
      source: entry.source || "manual",
      id: entry.id || `DS-${Date.now() + index}`
    };
  }

  function mergeSeedRecords(records, seedRecords) {
    const merged = [...(seedRecords || []).map(clone)];
    (records || []).forEach((record) => {
      const exists = merged.some((seed) =>
        String(seed.id || "") === String(record.id || "") ||
        normalize(seed.subject) === normalize(record.subject)
      );
      if (!exists) merged.push(clone(record));
    });
    return merged;
  }

  function formatSavedTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "Unknown";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatSourceLabel(value) {
    return String(value || "manual")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function saveStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // ignore local persistence failures
    }
  }

  const state = {
    selectedId: defaultTickets[0].id,
    storeDetailId: defaultTickets[0].id,
    storeModalOpen: false,
    storeEditMode: false,
    datasetDetailId: null,
    datasetModalOpen: false,
    datasetCreateModalOpen: false,
    filter: "All",
    view: "desk",
    apiMode: window.location.protocol === "file:" ? "Local preview" : "Connected preview",
    analysisCache: {},
    labResult: null,
    labSession: null,
    demoRunId: 0,
    runtimeTrace: [],
    ticketStore: mergeSeedRecords(loadStore(TICKET_STORE_KEY, defaultTickets).map(hydrateTicketEntry), defaultTickets).map(hydrateTicketEntry),
    datasetStore: mergeSeedRecords(loadStore(DATASET_STORE_KEY, seededDatasetEntries).map(hydrateDatasetEntry), seededDatasetEntries).map(hydrateDatasetEntry),
    rules: {
      highPriority: ["urgent", "blocked", "offline", "failed", "error", "same-day", "outage", "asap"],
      billing: ["recording", "storage", "disk full", "retention", "footage", "channels", "nvr"],
      workflow: ["firmware", "update", "motion", "alerts", "sensitivity", "batch", "night vision", "ir"],
      routes: {
        incident: "Field response",
        recording: "Platform support",
        vision: "Camera support",
        config: "Customer success",
        general: "Support queue"
      }
    }
  };

  const filters = ["All", "High", "Medium", "Low"];
  const views = [
    { id: "desk", label: "Desk", note: "Queue + case view" },
    { id: "workflow", label: "Workflow", note: "Flow + handoff" },
    { id: "store", label: "Ticket Store", note: "Full inventory" },
    { id: "pipeline", label: "Pipeline Lab", note: "Run fresh cases" },
    { id: "rules", label: "Rules", note: "Editable logic" },
    { id: "knowledge", label: "Knowledge", note: "Articles + coverage" },
    { id: "dataset", label: "Dataset", note: "Saved case library" },
    { id: "ops", label: "Ops", note: "Notify + runtime" }
  ];

  function pushTrace(kind, title, detail) {
    state.runtimeTrace = [{ kind, title, detail }, ...state.runtimeTrace].slice(0, 10);
  }

  function isPickedUp(ticket) {
    return PICKED_UP_STATUSES.has(normalize(ticket.status));
  }

  function isQueueTicket(ticket) {
    return normalize(ticket.status) === "open" && !isPickedUp(ticket);
  }

  function formatStatusLabel(status) {
    const raw = String(status || "open").replace(/[_-]/g, " ");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  async function getKnowledgeMatch(subject, body) {
    const payload = { subject, latest_message: body };
    if (window.location.protocol !== "file:") {
      try {
        const response = await fetch("/api/qa-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          pushTrace("api", "QA match API", "Used /api/qa-match from the local workflow scaffold.");
          return await response.json();
        }
      } catch (_) {
        pushTrace("fallback", "QA match fallback", "Local keyword scoring used because /api/qa-match was unavailable.");
      }
    } else {
      pushTrace("fallback", "QA match fallback", "Local keyword scoring used in file preview mode.");
    }

    const text = normalize(`${subject} ${body}`);
    const scored = knowledgeBase
      .map((item) => ({ item, score: scoreKeywordHits(text, item.triggers) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      return { matched: false, matches: [] };
    }

    const best = scored[0];
    return {
      matched: true,
      matches: [
        {
          title: best.item.title,
          category: best.item.category,
          confidence: Math.min(0.96, 0.58 + best.score * 0.08),
          answer: best.item.answer
        }
      ]
    };
  }

  async function getAiSuggestion(subject, body) {
    if (window.location.protocol === "file:") {
      pushTrace("fallback", "AI summary fallback", "Skipped /api/gemini/chat in file preview.");
      return null;
    }

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Summarize operator action for subject: ${subject}\n\nMessage:\n${body}`
        })
      });
      if (!response.ok) throw new Error("non-200");
      const data = await response.json();
      pushTrace("api", "AI summary API", "Used /api/gemini/chat to fetch a parsed recommendation.");
      return data && data.parsed ? data.parsed : null;
    } catch (_) {
      pushTrace("fallback", "AI summary fallback", "Used local action logic because /api/gemini/chat did not respond.");
      return null;
    }
  }

  async function getVisionSummary(body) {
    const imageHint = /screenshot|image|attachment|screen/i.test(body);
    if (window.location.protocol === "file:") {
      pushTrace("fallback", "Vision fallback", "Skipped /api/vision/analyze-ticket in file preview.");
      return { images_analyzed: imageHint ? 2 : 0, analyses: [] };
    }

    try {
      const response = await fetch("/api/vision/analyze-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ attachments: imageHint ? [{ is_image: true }, { is_image: true }] : [] }]
        })
      });
      if (!response.ok) throw new Error("non-200");
      const data = await response.json();
      pushTrace("api", "Vision analysis API", "Used /api/vision/analyze-ticket to inspect image evidence.");
      return data;
    } catch (_) {
      pushTrace("fallback", "Vision fallback", "Used attachment heuristic because /api/vision/analyze-ticket was unavailable.");
      return { images_analyzed: imageHint ? 2 : 0, analyses: [] };
    }
  }

  async function analyzeTicket(input) {
    const subject = String(input.subject || "").trim();
    const body = String(input.body || "").trim();
    const account = String(input.customer || input.account || "Unknown account").trim();
    const text = normalize(`${subject} ${body}`);
    const vipAccounts = new Set(["northgate mall", "ironwood casino"]);

    const recordingHits = scoreKeywordHits(text, state.rules.billing);
    const configHits = scoreKeywordHits(text, state.rules.workflow);
    const priorityHits = scoreKeywordHits(text, state.rules.highPriority);
    const spamHits = scoreKeywordHits(text, ["unsubscribe", "marketing", "seo", "sales pitch", "cold email", "newsletter"]);
    const screenClass = spamHits > 0 && !/\b(camera|nvr|recording|firmware|motion|vision|offline)\b/.test(text)
      ? "spam"
      : "support_request";

    let issueType = "General surveillance support";
    let issueTypeKey = "general";

    if (recordingHits > 0 || /\b(nvr|recording|disk full|retention|storage)\b/.test(text)) {
      issueType = "Recording and storage issue";
      issueTypeKey = "recording";
    } else if (/\b(night vision|ir|black footage|image issue|video issue)\b/.test(text)) {
      issueType = "Camera image issue";
      issueTypeKey = "vision";
    } else if (configHits > 0) {
      issueType = "Configuration and firmware request";
      issueTypeKey = "config";
    } else if (priorityHits > 0 || /\b(offline|not connecting|failed|error|blocked)\b/.test(text)) {
      issueType = "Connectivity or offline incident";
      issueTypeKey = "incident";
    }

    const requestMode = /\b(how do i|how to|is there|can we|what is|will cameras|how long|best way|batch update)\b/.test(text) &&
      !/\b(offline|not working|error|stopped|false alerts|disk full|recording stopped)\b/.test(text)
      ? "ask_information"
      : "request_action";

    let urgency = "Low";
    if (priorityHits >= 2 || /\b(same-day|today|asap|immediately|outage|recording stopped)\b/.test(text)) {
      urgency = "High";
    } else if (priorityHits === 1 || recordingHits > 0) {
      urgency = "Medium";
    }

    const accountTier = vipAccounts.has(normalize(account))
      ? "Flagship account"
      : /\b(expired|trial ended|lapsed contract|contract expired)\b/.test(text)
        ? "Contract review"
        : "Standard account";
    const accountState = vipAccounts.has(normalize(account))
      ? "VIP"
      : account && normalize(account) !== "unknown account"
        ? "Found"
        : "Not found";
    const expiryState = /\b(expired|trial ended|lapsed contract|contract expired)\b/.test(text) ? "Expired" : "Active";
    const tone = /\b(furious|outrage|unacceptable|ridiculous|disaster|terrible|awful|fed up)\b/.test(text)
      ? "Angry"
      : /\b(still not|again|asap|urgent|immediately|frustrat|need this fixed)\b/.test(text)
        ? "Frustrated"
        : "Normal";

    const missingInfo = [];
    if (issueTypeKey === "incident" && !/\b(camera\s*#?\d+|channel\s*\d+|hallway|lobby|entrance|parking|lot|door|wing)\b/.test(text)) {
      missingInfo.push("device or location");
    }
    if (issueTypeKey === "vision" && !/\b(camera\s*#?\d+|outdoor|indoor|after dark|night|ir|firmware)\b/.test(text)) {
      missingInfo.push("affected camera context");
    }
    if (issueTypeKey === "config" && !/\b(version|firmware|24 cameras|batch|sensitivity|zone|\d+\s*cameras?)\b/.test(text)) {
      missingInfo.push("target version or device scope");
    }
    if (issueTypeKey === "recording" && !/\b(retention|disk|nvr|channel|\d+\s*channels?)\b/.test(text)) {
      missingInfo.push("recorder scope");
    }

    const validationState = screenClass === "spam"
      ? "Skipped"
      : missingInfo.length
        ? "Missing info"
        : "Ready to act";

    let decisionCode = "notify_team";
    let decisionLabel = "Notify team";
    let decisionReason = "Hand off to the best owner with the current case summary.";

    if (screenClass === "spam") {
      decisionCode = "mark_spam";
      decisionLabel = "Mark as spam";
      decisionReason = "The message looks promotional rather than operational.";
    } else if (missingInfo.length) {
      decisionCode = "ask_info";
      decisionLabel = "Ask for more info";
      decisionReason = `Request ${missingInfo.join(" and ")} before routing.`;
    }

    const routeTarget = decisionCode === "mark_spam"
      ? "Trash review"
      : decisionCode === "ask_info"
        ? "Customer follow-up"
        : state.rules.routes[issueTypeKey] || state.rules.routes.general;
    const cleanedSummary = body.replace(/\s+/g, " ").split(". ").slice(0, 2).join(". ").trim();

    const [knowledge, aiSuggestion, vision] = await Promise.all([
      getKnowledgeMatch(subject, body),
      getAiSuggestion(subject, body),
      getVisionSummary(body)
    ]);

    const bestMatch = knowledge.matched && knowledge.matches.length ? knowledge.matches[0] : null;
    const confidence = bestMatch ? bestMatch.confidence : Math.min(0.93, 0.56 + (priorityHits + recordingHits + configHits) * 0.07);

    if (screenClass !== "spam" && !missingInfo.length) {
      if (requestMode === "ask_information" && bestMatch) {
        decisionCode = "reply_qa";
        decisionLabel = "Reply with guidance";
        decisionReason = "The request is informational and already matches a reusable answer path.";
      } else if (urgency === "High" || accountTier === "Flagship account") {
        decisionCode = "notify_team";
        decisionLabel = "Escalate and notify";
        decisionReason = "Urgency or account posture requires human follow-up.";
      } else if (bestMatch) {
        decisionCode = "reply_qa";
        decisionLabel = "Reply with guidance";
        decisionReason = "A knowledge match is strong enough to drive the response path.";
      } else if (requestMode === "ask_information") {
        decisionCode = "no_action";
        decisionLabel = "Answer in queue";
        decisionReason = "No handoff is required yet; the operator can answer directly.";
      }
    }

    const finalRouteTarget = decisionCode === "mark_spam"
      ? "Trash review"
      : decisionCode === "ask_info"
        ? "Customer follow-up"
        : decisionCode === "reply_qa" || decisionCode === "no_action"
          ? "Operator reply lane"
          : routeTarget;
    const notificationTier = screenClass === "spam"
      ? "None"
      : accountState === "VIP" && urgency === "High"
        ? "Mandatory page"
        : urgency === "High"
          ? "Urgent notify"
          : "Normal queue";
    const fallbackCase = screenClass === "spam"
      ? "Spam exit"
      : missingInfo.length
        ? "Ask info branch"
        : "None";

    const action = decisionCode === "mark_spam"
      ? "Remove from the active desk and keep a short audit trace."
      : decisionCode === "ask_info"
        ? `Ask for ${missingInfo.join(" and ")} before routing onward.`
        : decisionCode === "reply_qa"
          ? `Send a guided reply, then hand off through ${finalRouteTarget}.`
          : decisionCode === "no_action"
            ? "Answer directly from the desk without escalation."
            : `Escalate to ${finalRouteTarget} with an operator-ready brief.`;

    return {
      account,
      subject,
      body,
      summary: cleanedSummary,
      intent: issueType,
      intentKey: issueTypeKey,
      requestMode,
      urgency,
      routeTarget: finalRouteTarget,
      accountTier,
      accountState,
      tone,
      expiryState,
      notificationTier,
      fallbackCase,
      validationState,
      missingInfo,
      decisionCode,
      decisionLabel,
      decisionReason,
      screenClass,
      confidence: confidence.toFixed(2),
      knowledge,
      aiSuggestion,
      vision,
      action,
      stages: [
        {
          name: "Intake cleanup",
          status: "done",
          detail: "Condense the latest signal and remove repetitive thread noise.",
          output: cleanedSummary || "No message body provided."
        },
        {
          name: "Spam gate",
          status: "done",
          detail: "Separate likely support requests from obvious non-workflow noise before deeper triage.",
          output: screenClass === "spam" ? "Spam / remove from desk" : "Support request"
        },
        {
          name: "Account lookup",
          status: "done",
          detail: "Carry forward the customer context before urgency and routing decisions.",
          output: accountState
        },
        {
          name: "Tone read",
          status: "done",
          detail: "Capture whether the customer language is calm, frustrated, or escalatory.",
          output: tone
        },
        {
          name: "Urgency score",
          status: "done",
          detail: "Combine failure language, account posture, and impact hints into a priority posture.",
          output: `${urgency} priority`
        },
        {
          name: "Expiry check",
          status: "done",
          detail: "Flag expired or lapsed contract language before deciding the final handoff.",
          output: expiryState
        },
        {
          name: "Required info",
          status: "done",
          detail: "Check whether the operator has enough device, scope, or version detail to act safely.",
          output: missingInfo.length ? missingInfo.join(", ") : "Ready to proceed"
        },
        {
          name: "Intent + issue type",
          status: "done",
          detail: "Read both the customer request mode and the most likely camera issue type.",
          output: `${issueType} / ${requestMode.replace(/_/g, " ")}`
        },
        {
          name: "Action decision",
          status: "done",
          detail: "Choose the operating action: reply, ask for more info, escalate, or remove.",
          output: decisionLabel
        },
        {
          name: "Notification tier",
          status: "done",
          detail: "Map the case into the right follow-up surface once the action is known.",
          output: notificationTier
        },
        {
          name: "Knowledge assist",
          status: "done",
          detail: "Reuse a known troubleshooting path before inventing a fresh answer.",
          output: bestMatch ? bestMatch.title : "No close match"
        },
        {
          name: "Fallback case",
          status: "done",
          detail: "Show whether the case stayed on the main path or fell into a special handling branch.",
          output: fallbackCase
        },
        {
          name: "Route handoff",
          status: "done",
          detail: "Send the final action to the correct owner lane with the brief attached.",
          output: finalRouteTarget
        }
      ],
      flow: [
        { title: "Review intake", copy: "Clean the thread into one brief the next operator can scan in seconds." },
        { title: "Screen the ticket", copy: screenClass === "spam" ? "This reads like workflow noise, so it can leave the active desk." : "The message looks like a real support request and should stay in triage." },
        { title: "Classify the issue", copy: `Current read: ${issueType.toLowerCase()} with a ${requestMode.replace(/_/g, " ")} request mode.` },
        { title: "Score and validate", copy: missingInfo.length ? `Hold the route until ${missingInfo.join(" and ")} is clarified.` : `${urgency} priority and enough detail to act.` },
        { title: "Choose the action", copy: decisionReason },
        { title: "Route the handoff", copy: `Move the case to ${finalRouteTarget.toLowerCase()} with the current brief and evidence.` }
      ],
      handoff: [
        {
          title: "Customer-facing move",
          copy: decisionCode === "ask_info"
            ? `Ask only for ${missingInfo.join(" and ")} so the customer does not have to resend the whole story.`
            : urgency === "High"
              ? "Acknowledge the issue immediately, confirm the next update window, and avoid asking for duplicate context."
              : "Respond with the shortest useful answer path before handing off for deeper follow-up.",
          tags: [urgency.toLowerCase(), requestMode.replace(/_/g, "-")]
        },
        {
          title: "Internal routing move",
          copy: `${decisionLabel} through ${finalRouteTarget}, carrying the account posture and current issue type.`,
          tags: [finalRouteTarget, issueTypeKey]
        }
      ]
    };
  }

  function buildLabSession(analysis) {
    return {
      analysis,
      currentIndex: -1,
      steps: analysis.stages.map((stage) => ({ ...stage, revealed: false }))
    };
  }

  function getVisibleTickets() {
    const queueTickets = state.ticketStore.filter(isQueueTicket);
    if (state.filter === "All") return queueTickets;
    return queueTickets.filter((ticket) => ticket.priority.toLowerCase() === state.filter.toLowerCase());
  }

  function getSelectedTicket() {
    const visible = getVisibleTickets();
    return visible.find((ticket) => ticket.id === state.selectedId) || visible[0] || null;
  }

  function safePriorityLabel(ticket) {
    return ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1);
  }

  function renderHeroStats() {
    const queueCount = state.ticketStore.filter(isQueueTicket).length;
    const highCount = state.ticketStore.filter((ticket) => ticket.priority === "high").length;
    document.getElementById("heroStats").innerHTML = `
      <div class="hero-flow-card">
        <div class="hero-flow-step">
          <span class="hero-flow-index">01</span>
          <strong>Review</strong>
          <p>${queueCount} open ticket${queueCount === 1 ? "" : "s"}</p>
        </div>
        <div class="hero-flow-arrow" aria-hidden="true"></div>
        <div class="hero-flow-step">
          <span class="hero-flow-index">02</span>
          <strong>Screen</strong>
          <p>Remove noise early</p>
        </div>
        <div class="hero-flow-arrow" aria-hidden="true"></div>
        <div class="hero-flow-step">
          <span class="hero-flow-index">03</span>
          <strong>Classify</strong>
          <p>Issue type + request mode</p>
        </div>
        <div class="hero-flow-arrow" aria-hidden="true"></div>
        <div class="hero-flow-step">
          <span class="hero-flow-index">04</span>
          <strong>Score</strong>
          <p>${highCount} high-priority case${highCount === 1 ? "" : "s"}</p>
        </div>
        <div class="hero-flow-arrow" aria-hidden="true"></div>
        <div class="hero-flow-step">
          <span class="hero-flow-index">05</span>
          <strong>Decide</strong>
          <p>Validate then route</p>
        </div>
      </div>
    `;
  }

  function renderViewNav() {
    const root = document.getElementById("viewNav");
    root.innerHTML = views.map((view) => `
      <button type="button" class="view-tab${state.view === view.id ? " active" : ""}" data-view="${view.id}">
        ${view.label}
        <span>${view.note}</span>
      </button>
    `).join("");

    root.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        updateVisiblePanes();
        renderViewNav();
      });
    });
  }

  function updateVisiblePanes() {
    document.querySelectorAll("[data-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.pane !== state.view;
    });
  }

  function renderFilters() {
    const root = document.getElementById("filterRow");
    root.innerHTML = filters.map((filter) => `
      <button type="button" class="filter-chip${state.filter === filter ? " active" : ""}" data-filter="${filter}">${filter}</button>
    `).join("");

    root.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        const visible = getVisibleTickets();
        if (!visible.some((ticket) => ticket.id === state.selectedId) && visible[0]) {
          state.selectedId = visible[0].id;
        }
        render();
      });
    });
  }

  function renderQueue() {
    const visible = getVisibleTickets();
    document.getElementById("queueCount").textContent = String(visible.length);
    const root = document.getElementById("queueList");

    if (!visible.length) {
      root.innerHTML = `<div class="empty-note">No unclaimed open tickets match this filter right now.</div>`;
      return;
    }

    root.innerHTML = visible.map((ticket) => `
      <article class="queue-item priority-${ticket.priority}${ticket.id === state.selectedId ? " active" : ""}" data-id="${ticket.id}"${ticket.id === state.selectedId ? ' aria-current="true"' : ""}>
        <div class="queue-item-top">
          <strong>${ticket.customer}</strong>
          <div class="queue-priority">
            <span>${safePriorityLabel(ticket)}</span>
            <div class="priority-dot priority-${ticket.priority}"></div>
          </div>
        </div>
        <p>${ticket.subject}</p>
        <div class="queue-item-meta">
          <span>${ticket.id}</span>
        </div>
      </article>
    `).join("");

    root.querySelectorAll("[data-id]").forEach((node) => {
      node.addEventListener("click", () => {
        state.selectedId = node.dataset.id;
        render();
      });
    });
  }

  function renderCase(ticket, analysis) {
    document.getElementById("caseTitle").textContent = ticket.subject;
    document.getElementById("caseMeta").innerHTML = `
      <span class="summary-pill">${ticket.id}</span>
      <span class="summary-pill">${ticket.queue}</span>
    `;

    document.getElementById("caseSummary").innerHTML = `
      <div class="summary-kv">
        <span>Priority</span>
        <strong>${analysis.urgency}</strong>
      </div>
      <div class="summary-kv">
        <span>Account</span>
        <strong>${analysis.accountTier}</strong>
      </div>
      <div class="summary-kv summary-decision">
        <span>Decision</span>
        <strong>${analysis.decisionLabel}</strong>
      </div>
      <div class="summary-kv">
        <span>Q&A Match</span>
        <strong>${analysis.knowledge.matched && analysis.knowledge.matches.length ? analysis.knowledge.matches[0].title : "No close match"}</strong>
      </div>
      <div class="summary-action">
        <div>
          <span>Action detail</span>
          <strong>${analysis.action}</strong>
        </div>
        <p>${analysis.decisionReason}</p>
      </div>
      <div class="summary-secondary">
        <span>${analysis.intent}</span>
        <span>${analysis.requestMode.replace(/_/g, " ")}</span>
        <span>${analysis.validationState}</span>
        <span>${formatStatusLabel(ticket.status)}</span>
      </div>
    `;

    document.getElementById("messageStack").innerHTML = `
      <article class="message-card customer">
        <div class="message-head">
          <strong>Customer signal</strong>
          <span>Received ${ticket.receivedAt}</span>
        </div>
        <p class="message-copy">${ticket.body}</p>
        <div class="thread-pills">
          <span class="thread-pill">${analysis.intent}</span>
          <span class="thread-pill">${analysis.validationState}</span>
        </div>
      </article>
      <article class="message-card brief">
        <div class="message-head">
          <strong>Condensed operator brief</strong>
          <span>Auto-prepared</span>
        </div>
        <p class="message-copy">${analysis.summary}</p>
      </article>
    `;
  }

  function renderSignals(analysis) {
    document.getElementById("signalGrid").innerHTML = `
      <div class="signal-box action signal-primary">
        <div class="signal-copy">
          <span>Pipeline winner</span>
          <strong>${analysis.decisionCode.replace(/_/g, " ")}</strong>
          <p>${analysis.decisionReason}</p>
        </div>
        <div class="signal-value">${analysis.routeTarget}</div>
      </div>
      <div class="signal-box intent signal-compact">
        <div class="signal-copy">
          <span>Context</span>
          <strong>${analysis.intent}</strong>
        </div>
        <div class="signal-value">${analysis.requestMode.replace(/_/g, " ")}</div>
      </div>
      <div class="signal-box urgency signal-compact">
        <div class="signal-copy">
          <span>Account + urgency</span>
          <strong>${analysis.accountState} · ${analysis.urgency}</strong>
        </div>
        <div class="signal-value">${analysis.notificationTier}</div>
      </div>
      <div class="signal-box confidence signal-compact">
        <div class="signal-copy">
          <span>Validation gate</span>
          <strong>${analysis.validationState}</strong>
        </div>
        <div class="signal-value">${analysis.missingInfo.length ? analysis.missingInfo.length : "OK"}</div>
      </div>
    `;
  }

  function renderStages(analysis, progress = {}) {
    const currentIndex = Number.isInteger(progress.currentIndex) ? progress.currentIndex : analysis.stages.length - 1;
    const liveIndex = Number.isInteger(progress.liveIndex) ? progress.liveIndex : -1;

    document.getElementById("stageList").innerHTML = analysis.stages.map((stage, index) => {
      const status = index === liveIndex ? "live" : index <= currentIndex ? "done" : "pending";
      const visible = status !== "pending";
      return `
      <div class="stage-row stage-${getStageTone(stage)} stage-${status}">
        <div>
          <strong>${stage.name}</strong>
          <p>${stage.detail}</p>
          <div class="pipeline-meta"${visible ? "" : " hidden"}>
            <span class="signal-chip">${stage.output}</span>
          </div>
        </div>
        <span class="stage-state ${status}">${status}</span>
      </div>
    `;
    }).join("");
  }

  function getStageTone(stage) {
    const name = String(stage.name || "").toLowerCase();
    const output = String(stage.output || "").toLowerCase();
    const detail = String(stage.detail || "").toLowerCase();
    const text = `${name} ${output} ${detail}`;

    if (output.includes("spam") || output.includes("trash") || output.includes("missing") || output.includes("mandatory")) return "critical";
    if (output.includes("expired") || output.includes("high priority") || output.includes("urgent")) return "critical";
    if (output.includes("medium priority") || output.includes("notify") || output.includes("escalate")) return "warning";
    if (output.includes("active") || output.includes("ready") || output.includes("support request") || output.includes("vip") || output === "found") return "success";
    if (output.includes("normal queue") || output === "none") return "neutral";
    if (name.includes("action") || name.includes("notification") || text.includes("route")) return "warning";
    if (name.includes("intent") || name.includes("issue") || name.includes("knowledge") || name.includes("account")) return "info";
    return "neutral";
  }

  function renderKnowledge(analysis) {
    const root = document.getElementById("kbMatch");
    const match = analysis.knowledge;

    if (!match.matched || !match.matches.length) {
      root.innerHTML = `<div class="empty-note">No close reusable answer path found. The operator should create a fresh response and route manually.</div>`;
      return;
    }

    const best = match.matches[0];
    root.innerHTML = `
      <div class="kb-head">
        <div>
          <strong>${best.title}</strong>
          <p>${best.answer}</p>
        </div>
        <span class="kb-score">${Math.round(best.confidence * 100)}%</span>
      </div>
      <div class="kb-tags">
        <span class="signal-chip">${best.category}</span>
        <span class="signal-chip">knowledge assist</span>
        <span class="signal-chip">${analysis.routeTarget}</span>
        ${analysis.aiSuggestion && analysis.aiSuggestion.priority ? `<span class="signal-chip">ai:${analysis.aiSuggestion.priority}</span>` : ""}
      </div>
    `;
  }

  function renderFlow(analysis) {
    document.getElementById("flowMap").innerHTML = analysis.flow.map((step, index) => `
      <div class="flow-row">
        <div class="flow-step">
          <span class="step-number">${index + 1}</span>
          <div>
            <strong>${step.title}</strong>
            <p>${step.copy}</p>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderHandoffs(analysis) {
    document.getElementById("handoffList").innerHTML = analysis.handoff.map((item) => `
      <div class="handoff-row">
        <div>
          <strong>${item.title}</strong>
          <p>${item.copy}</p>
        </div>
        <div class="handoff-tags">
          ${item.tags.map((tag) => `<span class="handoff-tag">${tag}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderSamples() {
    const root = document.getElementById("sampleStrip");
    root.innerHTML = state.datasetStore.slice(0, 6).map((ticket) => `
      <button type="button" class="sample-chip" data-sample="${ticket.id}">${ticket.customer}</button>
    `).join("");

    root.querySelectorAll("[data-sample]").forEach((button) => {
      button.addEventListener("click", () => {
        const sample = state.datasetStore.find((ticket) => ticket.id === button.dataset.sample);
        if (!sample) return;
        document.getElementById("labAccount").value = sample.customer;
        document.getElementById("labSubject").value = sample.subject;
        document.getElementById("labBody").value = sample.body;
      });
    });
  }

  function renderRouteMatrix() {
    const root = document.getElementById("routeMatrix");
    root.innerHTML = Object.entries(state.rules.routes).map(([key, value]) => `
      <div class="route-row">
        <label for="route-${key}">${key}</label>
        <input class="route-input" id="route-${key}" data-route="${key}" value="${value}">
      </div>
    `).join("");

    root.querySelectorAll("[data-route]").forEach((input) => {
      input.addEventListener("input", () => {
        state.rules.routes[input.dataset.route] = input.value.trim() || state.rules.routes[input.dataset.route];
        rerenderSelected();
      });
    });
  }

  function renderLibrary() {
    document.getElementById("kbLibrary").innerHTML = knowledgeBase.map((item) => `
      <div class="library-item">
        <strong>${item.title}</strong>
        <p>${item.answer}</p>
        <div class="library-meta">
          <span class="signal-chip">${item.category}</span>
          ${item.triggers.slice(0, 3).map((trigger) => `<span class="signal-chip">${trigger}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderNotifications(analysis) {
    const urgencyChannel = analysis.urgency === "High" ? "Slack + email" : "Queue note";
    document.getElementById("notifyList").innerHTML = `
      <div class="notify-item">
        <strong>Operator note</strong>
        <p>${analysis.action}</p>
        <div class="notify-meta">
          <span class="signal-chip">${analysis.decisionLabel}</span>
          <span class="signal-chip">${analysis.routeTarget}</span>
        </div>
      </div>
      <div class="notify-item">
        <strong>Escalation surface</strong>
        <p>${urgencyChannel} is the current recommended handoff surface for this case.</p>
        <div class="notify-meta">
          <span class="signal-chip">${urgencyChannel}</span>
          <span class="signal-chip">${analysis.vision.images_analyzed || 0} image signal(s)</span>
        </div>
      </div>
      <div class="notify-item">
        <strong>Customer reply stance</strong>
        <p>${analysis.handoff[0].copy}</p>
        <div class="notify-meta">
          ${analysis.handoff[0].tags.map((tag) => `<span class="signal-chip">${tag}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function renderDatasetSummary() {
    const queueCount = state.ticketStore.filter(isQueueTicket).length;
    const summary = [
      { title: "Queue coverage", text: `${queueCount} ticket${queueCount === 1 ? "" : "s"} are still open and unclaimed in the desk queue.` },
      { title: "Priority mix", text: `${state.ticketStore.filter((t) => t.priority === "high").length} high, ${state.ticketStore.filter((t) => t.priority === "medium").length} medium, ${state.ticketStore.filter((t) => t.priority === "low").length} low priority tickets in the full store.` },
      { title: "Primary lanes", text: "Connectivity, recording, image quality, and configuration are the current routing buckets." },
      { title: "Dataset coverage", text: `${state.datasetStore.length} promoted or saved samples are available for replay in the pipeline lab.` }
    ];
    document.getElementById("datasetSummary").innerHTML = summary.map((item) => `
      <div class="library-item">
        <strong>${item.title}</strong>
        <p>${item.text}</p>
      </div>
    `).join("");
  }

  function renderDatasetList() {
    document.getElementById("datasetCount").textContent = `${state.datasetStore.length} entries`;
    const root = document.getElementById("datasetList");
    if (!state.datasetStore.length) {
      root.innerHTML = `<tr><td colspan="7"><div class="empty-note">No saved dataset entries yet.</div></td></tr>`;
      renderDatasetModal();
      return;
    }

    root.innerHTML = state.datasetStore.map((entry) => `
      <tr class="dataset-row${state.datasetDetailId === entry.id ? " active" : ""}" data-open-dataset="${entry.id}">
        <td>${entry.id}</td>
        <td>${entry.customer}</td>
        <td class="dataset-subject-cell">
          <strong>${entry.subject}</strong>
          <span>${entry.body ? `${entry.body.slice(0, 78)}${entry.body.length > 78 ? "..." : ""}` : "No body saved."}</span>
        </td>
        <td><span class="dataset-badge">${safePriorityLabel(entry)}</span></td>
        <td>${entry.queue}</td>
        <td>${formatSavedTime(entry.savedAt)}</td>
        <td>${formatSourceLabel(entry.source)}</td>
      </tr>
    `).join("");

    root.querySelectorAll("[data-open-dataset]").forEach((row) => {
      row.addEventListener("click", () => {
        state.datasetDetailId = row.dataset.openDataset;
        state.datasetModalOpen = true;
        renderDatasetList();
        renderDatasetModal();
      });
    });

    if (!state.datasetDetailId || !state.datasetStore.some((entry) => entry.id === state.datasetDetailId)) {
      state.datasetDetailId = state.datasetStore[0].id;
    }

    renderDatasetModal();
  }

  function renderStoreList() {
    document.getElementById("storeCount").textContent = `${state.ticketStore.length} tickets`;
    const root = document.getElementById("storeList");
    if (!state.ticketStore.length) {
      root.innerHTML = `<tr><td colspan="9"><div class="empty-note">No tracked tickets yet.</div></td></tr>`;
      renderStoreModal();
      return;
    }

    root.innerHTML = state.ticketStore.map((ticket) => `
      <tr class="dataset-row${state.storeDetailId === ticket.id ? " active" : ""}" data-open-store="${ticket.id}">
        <td>${ticket.id}</td>
        <td>${ticket.customer}</td>
        <td class="dataset-subject-cell">
          <strong>${ticket.subject}</strong>
          <span>${ticket.body ? `${ticket.body.slice(0, 78)}${ticket.body.length > 78 ? "..." : ""}` : "No body saved."}</span>
        </td>
        <td><span class="dataset-badge">${safePriorityLabel(ticket)}</span></td>
        <td><span class="store-status-pill status-${ticket.status}">${formatStatusLabel(ticket.status)}</span></td>
        <td>${ticket.owner || "Unassigned"}</td>
        <td>${ticket.receivedAt}</td>
        <td>${ticket.promotedToDataset ? "Promoted" : "Not yet"}</td>
        <td class="store-view-cell">
          <button type="button" class="ghost-btn compact-btn store-view-btn" data-run-store-btn="${ticket.id}">Run</button>
          <button type="button" class="ghost-btn compact-btn store-view-btn" data-open-store-btn="${ticket.id}">View</button>
        </td>
      </tr>
    `).join("");

    root.querySelectorAll("[data-open-store]").forEach((row) => {
      row.addEventListener("click", () => {
        state.storeDetailId = row.dataset.openStore;
        state.storeModalOpen = true;
        state.storeEditMode = false;
        renderStoreList();
        renderStoreModal();
      });
    });

    root.querySelectorAll("[data-open-store-btn]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.storeDetailId = button.dataset.openStoreBtn;
        state.storeModalOpen = true;
        state.storeEditMode = false;
        renderStoreList();
        renderStoreModal();
      });
    });

    root.querySelectorAll("[data-run-store-btn]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        loadStoreTicketIntoLab(button.dataset.runStoreBtn, { runNow: true });
      });
    });

    if (!state.storeDetailId || !state.ticketStore.some((ticket) => ticket.id === state.storeDetailId)) {
      state.storeDetailId = state.ticketStore[0].id;
    }

    renderStoreModal();
  }

  function updateTicketStore(ticketId, patch) {
    state.ticketStore = state.ticketStore.map((ticket) =>
      ticket.id === ticketId ? hydrateTicketEntry({ ...ticket, ...patch }, 0) : ticket
    );
    saveStore(TICKET_STORE_KEY, state.ticketStore);
  }

  function syncDatasetEntryFromTicket(ticket) {
    state.datasetStore = state.datasetStore.map((entry) => {
      if (String(entry.storeTicketId || "") !== String(ticket.id)) return entry;
      return hydrateDatasetEntry({
        ...entry,
        customer: ticket.customer,
        subject: ticket.subject,
        priority: ticket.priority,
        queue: ticket.queue,
        body: ticket.body,
        owner: ticket.owner,
        status: ticket.status
      }, 0);
    });
    saveStore(DATASET_STORE_KEY, state.datasetStore);
  }

  function setTicketPromotion(ticketId, shouldPromote) {
    const ticket = state.ticketStore.find((item) => item.id === ticketId);
    if (!ticket) return;

    updateTicketStore(ticketId, { promotedToDataset: shouldPromote });
    const freshTicket = state.ticketStore.find((item) => item.id === ticketId);
    if (!freshTicket) return;

    if (shouldPromote) {
      const existing = state.datasetStore.find((entry) => String(entry.storeTicketId || entry.id) === String(ticketId));
      if (!existing) {
        saveDatasetEntry({
          ...clone(freshTicket),
          id: `DS-${Date.now()}`,
          storeTicketId: freshTicket.id,
          savedAt: new Date().toISOString(),
          source: "ticket store"
        });
      } else {
        syncDatasetEntryFromTicket(freshTicket);
      }
      return;
    }

    state.datasetStore = state.datasetStore.filter((entry) => String(entry.storeTicketId || "") !== String(ticketId));
    saveStore(DATASET_STORE_KEY, state.datasetStore);
  }

  function promoteTicketToDataset(ticketId) {
    setTicketPromotion(ticketId, true);
  }

  function reopenTicketFromDataset(entry) {
    const linked = state.ticketStore.find((ticket) => String(ticket.id) === String(entry.storeTicketId || entry.id));
    if (linked) {
      updateTicketStore(linked.id, { status: "open", owner: "" });
      state.selectedId = linked.id;
      render();
      return;
    }

    const queueItem = hydrateTicketEntry({
      ...clone(entry),
      id: `SV-${Math.floor(Date.now() / 10)}`,
      storeTicketId: "",
      status: "open",
      owner: "",
      promotedToDataset: false,
      receivedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }, 0);
    state.ticketStore = [queueItem, ...state.ticketStore];
    state.selectedId = queueItem.id;
    saveStore(TICKET_STORE_KEY, state.ticketStore);
    render();
  }

  function closeStoreModal() {
    state.storeModalOpen = false;
    state.storeEditMode = false;
    document.getElementById("storeModal").hidden = true;
  }

  function loadStoreTicketIntoLab(ticketId, options = {}) {
    const ticket = state.ticketStore.find((item) => String(item.id) === String(ticketId));
    if (!ticket) return;
    document.getElementById("labAccount").value = ticket.customer;
    document.getElementById("labSubject").value = ticket.subject;
    document.getElementById("labBody").value = ticket.body;
    state.view = "pipeline";
    updateVisiblePanes();
    renderViewNav();
    if (options.runNow) {
      runLabAnalysis();
    }
  }

  function renderStoreModal() {
    const modal = document.getElementById("storeModal");
    const root = document.getElementById("storeModalContent");
    const editBtn = document.getElementById("storeModalEditBtn");
    const ticket = state.ticketStore.find((item) => item.id === state.storeDetailId);
    const isEditing = state.storeEditMode;

    if (!ticket || !state.storeModalOpen) {
      modal.hidden = true;
      editBtn.hidden = true;
      root.innerHTML = "";
      return;
    }

    editBtn.hidden = false;
    editBtn.textContent = isEditing ? "Cancel edit" : "Edit";
    editBtn.classList.toggle("is-editing", isEditing);

    root.innerHTML = `
      <div class="dataset-modal-grid">
        ${isEditing ? `
        <div class="dataset-modal-summary">
          <div class="dataset-modal-meta">
            <label class="field dataset-modal-meta-field">
              <span>Account</span>
              <input id="storeCustomerInput" type="text" value="${ticket.customer || ""}" placeholder="Northgate Mall">
            </label>
            <label class="field dataset-modal-meta-field">
              <span>Subject</span>
              <input id="storeSubjectInput" type="text" value="${ticket.subject || ""}" placeholder="Camera offline">
            </label>
          </div>
          <div class="dataset-modal-fields">
            <label class="field dataset-modal-field dataset-modal-field-edit">
              <span>Ticket ID</span>
              <strong>${ticket.id}</strong>
            </label>
            <label class="field dataset-modal-field dataset-modal-field-edit">
              <span>Priority</span>
              <select id="storePriorityInput" class="route-input">
                <option value="high"${ticket.priority === "high" ? " selected" : ""}>High</option>
                <option value="medium"${ticket.priority === "medium" ? " selected" : ""}>Medium</option>
                <option value="low"${ticket.priority === "low" ? " selected" : ""}>Low</option>
              </select>
            </label>
            <label class="field dataset-modal-field dataset-modal-field-edit">
              <span>Status</span>
              <select id="storeStatusInput" class="route-input">
                <option value="open"${ticket.status === "open" ? " selected" : ""}>Open</option>
                <option value="claimed"${ticket.status === "claimed" ? " selected" : ""}>Claimed</option>
                <option value="assigned"${ticket.status === "assigned" ? " selected" : ""}>Assigned</option>
                <option value="in_progress"${ticket.status === "in_progress" ? " selected" : ""}>In Progress</option>
                <option value="resolved"${ticket.status === "resolved" ? " selected" : ""}>Resolved</option>
              </select>
            </label>
            <label class="field dataset-modal-field dataset-modal-field-edit">
              <span>Owner</span>
              <input id="storeOwnerInput" type="text" value="${ticket.owner || ""}" placeholder="Ops triage">
            </label>
            <label class="field dataset-modal-field dataset-modal-field-edit">
              <span>Queue</span>
              <input id="storeQueueInput" type="text" value="${ticket.queue || ""}" placeholder="Enterprise">
            </label>
            <label class="field dataset-modal-field dataset-modal-field-edit checkbox-field">
              <span>Dataset</span>
              <label class="toggle-row">
                <input id="storePromotedInput" type="checkbox"${ticket.promotedToDataset ? " checked" : ""}>
                <span class="toggle-check" aria-hidden="true"></span>
                <span class="toggle-copy">
                  <strong>Promoted</strong>
                  <small>Keep this ticket in the reusable sample set.</small>
                </span>
              </label>
            </label>
          </div>
        </div>
        <div class="dataset-modal-body">
          <label class="field">
            <span>Latest customer message</span>
            <textarea id="storeBodyInput" rows="7" placeholder="Write the latest customer message">${ticket.body || ""}</textarea>
          </label>
        </div>
        <div class="lab-actions modal-primary-actions">
            <button class="ghost-btn primary-btn" type="button" data-store-save="${ticket.id}">Save changes</button>
            <button class="ghost-btn compact-btn" type="button" data-store-status="${ticket.id}">
              ${isPickedUp(ticket) ? "Return to queue" : "Claim ticket"}
            </button>
            <button class="ghost-btn compact-btn" type="button" data-store-desk="${ticket.id}">Open in desk</button>
            <button class="ghost-btn compact-btn" type="button" data-store-lab="${ticket.id}">Load to lab</button>
          </div>
        ` : `
        <div class="dataset-modal-summary">
          <div class="dataset-modal-meta">
            <div>
              <span class="eyebrow">Account</span>
              <strong>${ticket.customer}</strong>
            </div>
            <div>
              <span class="eyebrow">Subject</span>
              <strong>${ticket.subject}</strong>
            </div>
          </div>
          <div class="dataset-modal-fields">
            <div class="dataset-modal-field"><span>Ticket ID</span><strong>${ticket.id}</strong></div>
            <div class="dataset-modal-field"><span>Priority</span><strong>${safePriorityLabel(ticket)}</strong></div>
            <div class="dataset-modal-field"><span>Status</span><strong>${formatStatusLabel(ticket.status)}</strong></div>
            <div class="dataset-modal-field"><span>Owner</span><strong>${ticket.owner || "Unassigned"}</strong></div>
            <div class="dataset-modal-field"><span>Queue</span><strong>${ticket.queue}</strong></div>
            <div class="dataset-modal-field"><span>Dataset</span><strong>${ticket.promotedToDataset ? "Promoted" : "Not yet"}</strong></div>
          </div>
        </div>
        <div class="dataset-modal-body">
          <span class="eyebrow">Latest customer message</span>
          <p>${ticket.body || "No case body saved."}</p>
        </div>
        <div class="lab-actions modal-primary-actions">
          <button class="ghost-btn primary-btn" type="button" data-store-status="${ticket.id}">
            ${isPickedUp(ticket) ? "Return to queue" : "Claim ticket"}
          </button>
          <button class="ghost-btn compact-btn" type="button" data-store-promote="${ticket.id}">
            ${ticket.promotedToDataset ? "Already in dataset" : "Promote to dataset"}
          </button>
          <button class="ghost-btn compact-btn" type="button" data-store-desk="${ticket.id}">Open in desk</button>
          <button class="ghost-btn compact-btn" type="button" data-store-lab="${ticket.id}">Load to lab</button>
        </div>
        `}
      </div>
    `;

    root.querySelector("[data-store-status]")?.addEventListener("click", () => {
      closeStoreModal();
      if (isPickedUp(ticket)) {
        updateTicketStore(ticket.id, { status: "open", owner: "" });
      } else {
        updateTicketStore(ticket.id, { status: "claimed", owner: "Ops triage" });
      }
      render();
    });
    root.querySelector("[data-store-promote]")?.addEventListener("click", () => {
      closeStoreModal();
      if (!ticket.promotedToDataset) {
        promoteTicketToDataset(ticket.id);
        render();
      }
    });
    root.querySelector("[data-store-save]")?.addEventListener("click", () => {
      const nextCustomer = document.getElementById("storeCustomerInput").value.trim() || ticket.customer;
      const nextSubject = document.getElementById("storeSubjectInput").value.trim() || ticket.subject;
      const nextPriority = normalize(document.getElementById("storePriorityInput").value) || ticket.priority;
      const nextStatus = normalizeTicketStatus(document.getElementById("storeStatusInput").value);
      const nextOwnerRaw = document.getElementById("storeOwnerInput").value.trim();
      const nextQueue = document.getElementById("storeQueueInput").value.trim() || ticket.queue;
      const nextBody = document.getElementById("storeBodyInput").value.trim();
      const nextPromoted = document.getElementById("storePromotedInput").checked;
      const nextOwner = nextStatus === "open" ? "" : nextOwnerRaw;

      updateTicketStore(ticket.id, {
        customer: nextCustomer,
        subject: nextSubject,
        priority: nextPriority,
        status: nextStatus,
        owner: nextOwner,
        queue: nextQueue,
        body: nextBody
      });

      setTicketPromotion(ticket.id, nextPromoted);
      state.storeEditMode = false;
      render();
      renderStoreModal();
    });
    root.querySelector("[data-store-desk]")?.addEventListener("click", () => {
      closeStoreModal();
      if (isPickedUp(ticket)) {
        updateTicketStore(ticket.id, { status: "open", owner: "" });
      }
      state.selectedId = ticket.id;
      state.view = "desk";
      updateVisiblePanes();
      renderViewNav();
      render();
    });
    root.querySelector("[data-store-lab]")?.addEventListener("click", () => {
      closeStoreModal();
      loadStoreTicketIntoLab(ticket.id, { runNow: true });
    });

    modal.hidden = false;
  }

  function loadDatasetIntoLab(id) {
    const item = state.datasetStore.find((entry) => entry.id === id);
    if (!item) return;
    document.getElementById("labAccount").value = item.customer;
    document.getElementById("labSubject").value = item.subject;
    document.getElementById("labBody").value = item.body;
    state.view = "pipeline";
    updateVisiblePanes();
    renderViewNav();
  }

  function sendDatasetToDesk(id) {
    const item = state.datasetStore.find((entry) => entry.id === id);
    if (!item) return;
    reopenTicketFromDataset(item);
  }

  function deleteDatasetEntry(id) {
    const removed = state.datasetStore.find((entry) => entry.id === id);
    state.datasetStore = state.datasetStore.filter((entry) => entry.id !== id);
    if (state.datasetDetailId === id) {
      state.datasetDetailId = state.datasetStore[0]?.id || null;
      state.datasetModalOpen = false;
    }
    if (removed && removed.storeTicketId) {
      updateTicketStore(removed.storeTicketId, { promotedToDataset: false });
    }
    saveStore(DATASET_STORE_KEY, state.datasetStore);
    render();
  }

  function closeDatasetModal() {
    state.datasetModalOpen = false;
    document.getElementById("datasetModal").hidden = true;
  }

  function openDatasetCreateModal() {
    state.datasetCreateModalOpen = true;
    document.getElementById("datasetCreateModal").hidden = false;
  }

  function closeDatasetCreateModal() {
    state.datasetCreateModalOpen = false;
    document.getElementById("datasetCreateModal").hidden = true;
  }

  function renderDatasetModal() {
    const modal = document.getElementById("datasetModal");
    const root = document.getElementById("datasetModalContent");
    const entry = state.datasetStore.find((item) => item.id === state.datasetDetailId);

    if (!entry || !state.datasetModalOpen) {
      modal.hidden = true;
      root.innerHTML = "";
      return;
    }

    root.innerHTML = `
      <div class="dataset-modal-grid">
        <div class="dataset-modal-summary">
          <div class="dataset-modal-meta">
            <div>
              <span class="eyebrow">Account</span>
              <strong>${entry.customer}</strong>
            </div>
            <div>
              <span class="eyebrow">Subject</span>
              <strong>${entry.subject}</strong>
            </div>
          </div>
          <div class="dataset-modal-fields">
            <div class="dataset-modal-field"><span>Ticket ID</span><strong>${entry.id}</strong></div>
            <div class="dataset-modal-field"><span>Priority</span><strong>${safePriorityLabel(entry)}</strong></div>
            <div class="dataset-modal-field"><span>Queue</span><strong>${entry.queue}</strong></div>
            <div class="dataset-modal-field"><span>Saved time</span><strong>${formatSavedTime(entry.savedAt)}</strong></div>
            <div class="dataset-modal-field"><span>Source</span><strong>${formatSourceLabel(entry.source)}</strong></div>
            <div class="dataset-modal-field"><span>Owner</span><strong>${entry.owner || "Dataset"}</strong></div>
          </div>
        </div>
        <div class="dataset-modal-body">
          <span class="eyebrow">Latest customer message</span>
          <p>${entry.body || "No case body saved."}</p>
        </div>
        <div class="lab-actions">
          <button class="ghost-btn compact-btn" type="button" data-modal-load="${entry.id}">Load to lab</button>
          <button class="ghost-btn compact-btn" type="button" data-modal-queue="${entry.id}">Send to desk</button>
          <button class="ghost-btn compact-btn" type="button" data-modal-delete="${entry.id}">Delete</button>
        </div>
      </div>
    `;

    root.querySelector("[data-modal-load]").addEventListener("click", () => {
      closeDatasetModal();
      loadDatasetIntoLab(entry.id);
    });
    root.querySelector("[data-modal-queue]").addEventListener("click", () => {
      closeDatasetModal();
      sendDatasetToDesk(entry.id);
    });
    root.querySelector("[data-modal-delete]").addEventListener("click", () => {
      closeDatasetModal();
      deleteDatasetEntry(entry.id);
    });

    modal.hidden = false;
  }

  function renderRuntimeTrace() {
    const root = document.getElementById("runtimeTrace");
    if (!state.runtimeTrace.length) {
      root.innerHTML = `<div class="empty-note">Run the desk or pipeline lab to see which APIs responded and which steps fell back to local logic.</div>`;
      return;
    }

    root.innerHTML = state.runtimeTrace.map((item) => `
      <div class="notify-item">
        <div class="trace-kind">${item.kind}</div>
        <strong>${item.title}</strong>
        <p>${item.detail}</p>
      </div>
    `).join("");
  }

  function renderPipelineResults() {
    const root = document.getElementById("pipelineResults");
    if (!state.labSession) {
      root.innerHTML = `<div class="empty-note">Run a fresh case through the pipeline to inspect step outputs.</div>`;
      return;
    }

    const session = state.labSession;
    const analysis = session.analysis;
    root.innerHTML = `
      <div class="lab-actions">
        <button class="ghost-btn compact-btn" id="runNextStepBtn" type="button">Run next step</button>
        <button class="ghost-btn compact-btn" id="runAllStepsBtn" type="button">Run all</button>
        <button class="ghost-btn compact-btn" id="resetStepsBtn" type="button">Reset</button>
      </div>
      <div class="pipeline-label-panel">
        <div class="panel-head compact">
          <div>
            <span class="eyebrow">Simulator labels</span>
            <h3>Triage checkpoints</h3>
          </div>
        </div>
        <div class="pipeline-label-grid">
          <div class="pipeline-label-card"><span>Spam</span><strong>${analysis.screenClass === "spam" ? "Yes" : "No"}</strong></div>
          <div class="pipeline-label-card"><span>Account</span><strong>${analysis.accountState}</strong></div>
          <div class="pipeline-label-card"><span>Tone</span><strong>${analysis.tone}</strong></div>
          <div class="pipeline-label-card"><span>Urgency</span><strong>${analysis.urgency}</strong></div>
          <div class="pipeline-label-card"><span>Expiry</span><strong>${analysis.expiryState}</strong></div>
          <div class="pipeline-label-card"><span>Required info</span><strong>${analysis.missingInfo.length ? analysis.missingInfo.join(", ") : "Ready"}</strong></div>
          <div class="pipeline-label-card"><span>Intent</span><strong>${analysis.requestMode.replace(/_/g, " ")}</strong></div>
          <div class="pipeline-label-card"><span>Issue type</span><strong>${analysis.intent}</strong></div>
          <div class="pipeline-label-card"><span>Action</span><strong>${analysis.decisionLabel}</strong></div>
          <div class="pipeline-label-card"><span>Notification</span><strong>${analysis.notificationTier}</strong></div>
          <div class="pipeline-label-card"><span>Fallback</span><strong>${analysis.fallbackCase}</strong></div>
        </div>
      </div>
      ${session.steps.map((stage, index) => `
        <div class="pipeline-step">
          <div class="pipeline-step-head">
            <strong>${index + 1}. ${stage.name}</strong>
            <span class="stage-state ${stage.revealed ? "done" : "pending"}">${stage.revealed ? "done" : "pending"}</span>
          </div>
          <p>${stage.detail}</p>
          ${stage.revealed ? `<div class="pipeline-meta"><span class="signal-chip">${stage.output}</span></div>` : ""}
        </div>
      `).join("")}
    `;

    document.getElementById("runNextStepBtn").addEventListener("click", () => {
      const nextIndex = Math.min(state.labSession.currentIndex + 1, state.labSession.steps.length - 1);
      state.labSession.steps[nextIndex].revealed = true;
      state.labSession.currentIndex = nextIndex;
      document.getElementById("labState").textContent = nextIndex === state.labSession.steps.length - 1 ? "Done" : `Step ${nextIndex + 1}`;
      renderPipelineResults();
    });

    document.getElementById("runAllStepsBtn").addEventListener("click", () => {
      state.labSession.steps.forEach((step) => { step.revealed = true; });
      state.labSession.currentIndex = state.labSession.steps.length - 1;
      document.getElementById("labState").textContent = "Done";
      renderPipelineResults();
    });

    document.getElementById("resetStepsBtn").addEventListener("click", () => {
      state.labSession.steps.forEach((step) => { step.revealed = false; });
      state.labSession.currentIndex = -1;
      document.getElementById("labState").textContent = "Idle";
      renderPipelineResults();
    });
  }

  function syncRuleInputs() {
    document.getElementById("highPriorityRules").value = state.rules.highPriority.join(", ");
    document.getElementById("billingRules").value = state.rules.billing.join(", ");
    document.getElementById("workflowRules").value = state.rules.workflow.join(", ");
  }

  function bindRuleInputs() {
    document.getElementById("highPriorityRules").addEventListener("input", (event) => {
      state.rules.highPriority = parseRuleList(event.target.value);
      rerenderSelected();
    });
    document.getElementById("billingRules").addEventListener("input", (event) => {
      state.rules.billing = parseRuleList(event.target.value);
      rerenderSelected();
    });
    document.getElementById("workflowRules").addEventListener("input", (event) => {
      state.rules.workflow = parseRuleList(event.target.value);
      rerenderSelected();
    });
  }

  async function rerenderSelected() {
    state.runtimeTrace = [];
    const ticket = getSelectedTicket();
    if (!ticket) {
      document.getElementById("caseTitle").textContent = "No unclaimed open case";
      document.getElementById("caseMeta").innerHTML = "";
      document.getElementById("caseSummary").innerHTML = `<div class="empty-note">The queue is empty. Open or return a ticket from Ticket Store to bring it back into the desk queue.</div>`;
      document.getElementById("messageStack").innerHTML = "";
      document.getElementById("signalGrid").innerHTML = "";
      document.getElementById("stageList").innerHTML = "";
      document.getElementById("kbMatch").innerHTML = "";
      document.getElementById("analysisState").textContent = "Queue empty";
      renderRuntimeTrace();
      return;
    }
    const analysis = await analyzeTicket(ticket);
    state.analysisCache[ticket.id] = analysis;
    renderCase(ticket, analysis);
    renderSignals(analysis);
    renderStages(analysis);
    renderKnowledge(analysis);
    renderFlow(analysis);
    renderHandoffs(analysis);
    renderNotifications(analysis);
    renderRuntimeTrace();
    document.getElementById("analysisState").textContent = formatStatusLabel(ticket.status);
  }

  async function runTopbarAnalysis() {
    const button = document.getElementById("analyzeBtn");
    const priorLabel = button.textContent;
    button.classList.add("is-running");
    button.textContent = "Running...";
    state.view = "desk";
    renderViewNav();
    updateVisiblePanes();
    document.getElementById("analysisState").textContent = "Running";

    try {
      await rerenderSelected();
      document.querySelector(".case-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelectorAll(".case-panel, .decision-card").forEach((node) => {
        node.classList.remove("analysis-flash");
        void node.offsetWidth;
        node.classList.add("analysis-flash");
      });
    } finally {
      button.classList.remove("is-running");
      button.textContent = priorLabel;
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function runSelectedDemo() {
    const ticket = getSelectedTicket();
    if (!ticket) return;

    const runId = ++state.demoRunId;
    const topBtn = document.getElementById("demoBtn");
    const inlineBtn = document.getElementById("runSelectedDemoBtn");
    [topBtn, inlineBtn].forEach((button) => {
      if (!button) return;
      button.classList.add("is-running");
      button.textContent = "Running...";
    });

    state.view = "desk";
    renderViewNav();
    updateVisiblePanes();
    document.getElementById("analysisState").textContent = "Running";
    state.runtimeTrace = [];

    try {
      const analysis = await analyzeTicket(ticket);
      if (runId !== state.demoRunId) return;

      state.analysisCache[ticket.id] = analysis;
      renderCase(ticket, analysis);
      renderSignals(analysis);
      renderKnowledge(analysis);
      renderFlow(analysis);
      renderHandoffs(analysis);
      renderNotifications(analysis);
      renderRuntimeTrace();
      renderStages(analysis, { currentIndex: -1, liveIndex: 0 });
      document.querySelector(".decision-card")?.scrollIntoView({ behavior: "smooth", block: "start" });

      for (let index = 0; index < analysis.stages.length; index += 1) {
        if (runId !== state.demoRunId) return;
        document.getElementById("analysisState").textContent = `Step ${index + 1}/${analysis.stages.length}`;
        renderStages(analysis, { currentIndex: index - 1, liveIndex: index });
        await wait(520);
        if (runId !== state.demoRunId) return;
        renderStages(analysis, { currentIndex: index, liveIndex: -1 });
        await wait(180);
      }

      document.getElementById("analysisState").textContent = "Demo complete";
      document.querySelectorAll(".case-panel, .decision-card").forEach((node) => {
        node.classList.remove("analysis-flash");
        void node.offsetWidth;
        node.classList.add("analysis-flash");
      });
    } finally {
      if (runId === state.demoRunId) {
        [topBtn, inlineBtn].forEach((button) => {
          if (!button) return;
          button.classList.remove("is-running");
        });
        if (topBtn) topBtn.textContent = "Run demo";
        if (inlineBtn) inlineBtn.textContent = "Run selected demo";
      }
    }
  }

  function readDatasetForm() {
    return {
      id: `DS-${Date.now()}`,
      customer: document.getElementById("datasetAccount").value.trim() || "Untitled account",
      subject: document.getElementById("datasetSubject").value.trim(),
      priority: document.getElementById("datasetPriority").value,
      queue: document.getElementById("datasetQueue").value.trim() || "General",
      body: document.getElementById("datasetBody").value.trim(),
      status: "Saved sample",
      owner: "Dataset",
      receivedAt: "Sample",
      savedAt: new Date().toISOString(),
      source: "manual"
    };
  }

  function saveDatasetEntry(entry) {
    const hydrated = hydrateDatasetEntry(entry, 0);
    state.datasetStore = [hydrated, ...state.datasetStore.filter((item) => item.id !== hydrated.id)];
    state.datasetDetailId = hydrated.id;
    if (hydrated.storeTicketId) updateTicketStore(hydrated.storeTicketId, { promotedToDataset: true });
    saveStore(DATASET_STORE_KEY, state.datasetStore);
  }

  async function runLabAnalysis() {
    const account = document.getElementById("labAccount").value.trim() || "Ad hoc account";
    const subject = document.getElementById("labSubject").value.trim();
    const body = document.getElementById("labBody").value.trim();

    if (!subject || !body) {
      document.getElementById("labState").textContent = "Missing input";
      return;
    }

    state.runtimeTrace = [];
    document.getElementById("labState").textContent = "Running";
    state.labResult = await analyzeTicket({ customer: account, subject, body });
    state.labSession = buildLabSession(state.labResult);
    document.getElementById("labState").textContent = "Idle";
    renderPipelineResults();
    renderRuntimeTrace();
  }

  async function render() {
    renderHeroStats();
    renderViewNav();
    updateVisiblePanes();
    renderFilters();
    renderQueue();
    renderStoreList();
    renderSamples();
    syncRuleInputs();
    renderRouteMatrix();
    renderLibrary();
    renderDatasetSummary();
    renderDatasetList();
    renderPipelineResults();
    renderRuntimeTrace();
    await rerenderSelected();
  }

  document.getElementById("analyzeBtn").addEventListener("click", runTopbarAnalysis);
  document.getElementById("demoBtn").addEventListener("click", runSelectedDemo);
  document.getElementById("runLabBtn").addEventListener("click", runLabAnalysis);
  document.getElementById("runSelectedDemoBtn").addEventListener("click", runSelectedDemo);
  document.getElementById("rerunSelectedBtn").addEventListener("click", rerenderSelected);
  document.getElementById("saveDatasetBtn").addEventListener("click", () => {
    const entry = readDatasetForm();
    if (!entry.subject || !entry.body) return;
    saveDatasetEntry(entry);
    closeDatasetCreateModal();
    render();
  });
  document.getElementById("saveSelectedBtn").addEventListener("click", () => {
    const selected = getSelectedTicket();
    if (!selected) return;
    saveDatasetEntry({
      ...clone(selected),
      id: `DS-${Date.now()}`,
      storeTicketId: selected.id,
      savedAt: new Date().toISOString(),
      source: "desk clone"
    });
    closeDatasetCreateModal();
    render();
  });
  document.getElementById("openDatasetCreateBtn").addEventListener("click", openDatasetCreateModal);
  document.getElementById("closeDatasetModalBtn").addEventListener("click", closeDatasetModal);
  document.getElementById("closeStoreModalBtn").addEventListener("click", closeStoreModal);
  document.getElementById("storeModalEditBtn").addEventListener("click", () => {
    if (!state.storeModalOpen) return;
    state.storeEditMode = !state.storeEditMode;
    renderStoreModal();
  });
  document.querySelectorAll("[data-close-modal='true']").forEach((node) => {
    node.addEventListener("click", closeDatasetModal);
  });
  document.querySelectorAll("[data-close-store-modal='true']").forEach((node) => {
    node.addEventListener("click", closeStoreModal);
  });
  document.getElementById("closeDatasetCreateModalBtn").addEventListener("click", closeDatasetCreateModal);
  document.querySelectorAll("[data-close-create-modal='true']").forEach((node) => {
    node.addEventListener("click", closeDatasetCreateModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDatasetModal();
    if (event.key === "Escape") closeStoreModal();
    if (event.key === "Escape") closeDatasetCreateModal();
  });

  bindRuleInputs();
  render();
})();
