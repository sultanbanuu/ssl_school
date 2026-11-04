import React, { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { AppointmentPicker } from "./AppointmentPicker";
import {
  civil,
  fullName,
  schoolToday,
  slotDraft,
  useAvailability,
  type AvailabilityDraft,
  type AvailabilitySlot,
} from "./useAvailability";

export function Availability({
  role,
  onFailure,
}: {
  role: string;
  onFailure: (error: unknown) => void;
}) {
  const state = useAvailability(role, onFailure);
  const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
  const [teacher, setTeacher] = useState("");
  const wide = useWindowDimensions().width >= 760;
  const canDelete = role === "teacher" || role === "admin";
  const visible = state.slots
    .filter((slot) => slot.active && (!teacher || slot.teacherId === teacher))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const people = state.managing
    ? state.teachers
    : [
        ...new Map(
          state.slots.map((slot) => [slot.teacherId, slot.teacher]),
        ).values(),
      ];
  const button = (
    label: string,
    action: () => void,
    danger = false,
    selected = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: state.busy, selected }}
      disabled={state.busy}
      onPress={action}
      style={[s.button, selected && s.selected, state.busy && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, danger && { color: "#ff9b90" }]}>
        {label}
      </Text>
    </Pressable>
  );
  function remove(slot: AvailabilitySlot) {
    Alert.alert(
      "Delete availability?",
      slot.reservation
        ? "This will cancel the pending or confirmed trial and remove this time from booking. Trial history will be kept."
        : "Students will no longer be able to request this time.",
      [
        { text: "Keep availability", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void state
              .mutate(
                `/availability/${encodeURIComponent(slot.id)}`,
                "DELETE",
                undefined,
                "Availability deleted.",
              )
              .then((ok) => {
                if (ok && draft?.id === slot.id) setDraft(null);
              });
          },
        },
      ],
    );
  }
  async function save() {
    if (!draft) return;
    const { id: draftId, ...body } = draft;
    const id = draftId?.startsWith("auto:") ? undefined : draftId;
    if (
      await state.mutate(
        id ? `/availability/${id}` : "/availability",
        id ? "PATCH" : "POST",
        body,
        "Availability saved.",
      )
    )
      setDraft(null);
  }
  return (
    <View style={s.page}>
      <Text accessibilityRole="header" style={s.title}>
        Teacher Availability
      </Text>
      <Text style={s.muted}>
        15-minute trial lessons before enrollment. All times in Azerbaijan
        (GMT+4).
      </Text>
      {people.length > 1 && (
        <View style={s.actions}>
          {button("All teachers", () => setTeacher(""), false, !teacher)}
          {people.map((person) => (
            <View key={person.id}>
              {button(
                fullName(person.profile),
                () => setTeacher(person.id),
                false,
                teacher === person.id,
              )}
            </View>
          ))}
        </View>
      )}
      {state.managing &&
        button("Add availability", () =>
          setDraft({
            teacherId:
              role === "teacher" ? state.teachers[0]?.id || "" : teacher,
            courseId: "",
            date: schoolToday(),
            startTime: "10:00",
            endTime: "10:15",
          }),
        )}
      {!!state.error && (
        <Text accessibilityRole="alert" style={s.error}>
          {state.error}
        </Text>
      )}
      {!!state.notice && (
        <Text accessibilityLiveRegion="polite" style={s.muted}>
          {state.notice}
        </Text>
      )}
      {draft && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!state.busy) setDraft(null);
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#12241c88",
              justifyContent: "center",
              padding: 16,
              paddingVertical: 48,
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0, maxHeight: "100%" }}
            >
              <View style={s.card}>
                <Text style={s.subtitle}>
                  {draft.id
                    ? "Edit availability"
                    : "Publish trial availability"}
                </Text>
                <Text style={s.muted}>
                  Choose a teacher and course, then a 15-minute slot
                  Weekdays 10:00–11:00 or 15:00–23:30; Saturday 12:30–23:30. Closed Sunday.
                </Text>
                <View style={s.actions}>
                  {state.teachers.map((t) => (
                    <View key={t.id}>
                      {button(
                        `${draft.teacherId === t.id ? "✓ " : ""}${fullName(t.profile)}`,
                        () =>
                          setDraft({ ...draft, teacherId: t.id, courseId: "" }),
                        false,
                        draft.teacherId === t.id,
                      )}
                    </View>
                  ))}
                </View>
                <View style={s.actions}>
                  {state.courses
                    .filter((c) => c.active && c.teacherId === draft.teacherId)
                    .map((c) => (
                      <View key={c.id}>
                        {button(
                          c.name,
                          () => setDraft({ ...draft, courseId: c.id }),
                          false,
                          draft.courseId === c.id,
                        )}
                      </View>
                    ))}
                </View>
                {!!draft.teacherId &&
                  !state.courses.some(
                    (c) => c.active && c.teacherId === draft.teacherId,
                  ) && (
                    <Text style={s.muted}>
                      This teacher needs an active course before publishing
                      availability.
                    </Text>
                  )}
                <View style={[s.fields, wide && { flexDirection: "row" }]}>
                  {(["date", "startTime", "endTime"] as const).map((key) => {
                    const label =
                      key === "date"
                        ? "Date (YYYY-MM-DD)"
                        : key === "startTime"
                          ? "Start (HH:MM)"
                          : "End (HH:MM)";
                    return (
                      <View key={key} style={s.field}>
                        <Text style={s.muted}>{label}</Text>
                        <TextInput
                          accessibilityLabel={label}
                          editable={!state.busy}
                          value={draft[key]}
                          autoCapitalize="none"
                          autoCorrect={false}
                          maxLength={key === "date" ? 10 : 5}
                          onChangeText={(value) =>
                            setDraft({ ...draft, [key]: value })
                          }
                          style={s.input}
                        />
                      </View>
                    );
                  })}
                </View>
                <View style={s.actions}>
                  {button(
                    state.busy ? "Saving…" : "Save availability",
                    () => void save(),
                  )}
                  {button("Close editor", () => setDraft(null))}
                  {canDelete &&
                    draft.id &&
                    button(
                      "Delete availability",
                      () => {
                        const slot = state.slots.find((s) => s.id === draft.id);
                        if (slot) remove(slot);
                      },
                      true,
                    )}
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
      <AppointmentPicker
        onMonth={state.setCalendarMonth}
        week={state.week}
        onWeek={state.setWeek}
        slots={visible}
        busy={state.busy}
        loading={state.loading}
        onSelect={(slot) => {
          if (state.managing) setDraft(slotDraft(slot));
          else
            Alert.alert(
              "Request trial lesson?",
              `${fullName(slot.teacher.profile)} · ${civil(slot.startsAt).slice(0, 10)} · ${civil(slot.startsAt).slice(11, 16)}. Your request will wait for approval.`,
              [
                { text: "Go back", style: "cancel" },
                {
                  text: "Request",
                  onPress: () => {
                    void state.mutate(
                      "/trial-requests",
                      "POST",
                      { slotId: slot.id },
                      "Trial requested. Awaiting teacher approval.",
                    );
                  },
                },
              ],
            );
        }}
      />
      <Text accessibilityRole="header" style={s.title}>
        {state.managing ? "Trial requests" : "My trial requests"}
      </Text>
      {!state.trials.length && <Text style={s.muted}>No requests yet.</Text>}
      <View style={s.grid}>
        {state.trials.map((trial) => (
          <View key={trial.id} style={[s.card, wide && s.column]}>
            <Text style={s.subtitle}>
              {state.managing
                ? fullName(trial.student.profile)
                : fullName(trial.slot.teacher.profile)}{" "}
              · {trial.slot.course.name}
            </Text>
            <Text style={s.muted}>
              {civil(trial.slot.startsAt).slice(0, 10)} ·{" "}
              {civil(trial.slot.startsAt).slice(11, 16)} ·{" "}
              {trial.status === "approved" ? "Confirmed" : trial.status}
            </Text>
            <View style={s.actions}>
              {state.managing && trial.status === "pending" && (
                <>
                  {button("Approve trial", () => {
                    void state.mutate(
                      `/trial-requests/${trial.id}`,
                      "PATCH",
                      { status: "approved" },
                      "Trial confirmed.",
                    );
                  })}
                  {button("Decline trial", () => {
                    void state.mutate(
                      `/trial-requests/${trial.id}`,
                      "PATCH",
                      { status: "declined" },
                      "Trial declined.",
                    );
                  })}
                </>
              )}
              {["pending", "approved"].includes(trial.status) &&
                button("Cancel trial", () =>
                  Alert.alert(
                    "Cancel trial?",
                    "The time will become available again.",
                    [
                      { text: "Go back", style: "cancel" },
                      {
                        text: "Cancel trial",
                        style: "destructive",
                        onPress: () => {
                          void state.mutate(
                            `/trial-requests/${trial.id}`,
                            "PATCH",
                            { status: "cancelled" },
                            "Trial cancelled.",
                          );
                        },
                      },
                    ],
                  ),
                )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  page: { gap: 16, width: "100%" },
  title: { fontSize: 24, fontWeight: "600", color: "#f5f5f3" },
  subtitle: { fontSize: 16, fontWeight: "600", color: "#f5f5f3" },
  muted: { color: "#b5b5b5", lineHeight: 21, flexShrink: 1 },
  time: { color: "#f5f5f3", fontWeight: "600", lineHeight: 23 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#272727",
    maxWidth: "100%",
  },
  buttonText: { color: "#f5f5f3", fontWeight: "600", flexShrink: 1 },
  selected: { borderWidth: 1, borderColor: "#3d3d3d" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#3d3d3d",
    gap: 10,
  },
  column: { width: "48%", flexGrow: 1, flexBasis: "45%" },
  fields: { gap: 12 },
  field: { flex: 1, minWidth: 0, gap: 6 },
  input: {
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#3d3d3d",
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
    color: "#f5f5f3",
  },
  error: {
    color: "#ff9b90",
    backgroundColor: "#272727",
    padding: 12,
    borderRadius: 10,
  },
});
