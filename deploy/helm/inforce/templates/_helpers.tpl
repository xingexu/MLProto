{{- define "inforce.labels" -}}
app.kubernetes.io/part-of: inforce
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "inforce.image" -}}
{{ .root.Values.imageRegistry }}/inforce-{{ .name }}:{{ .root.Values.imageTag }}
{{- end -}}
