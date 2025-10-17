{{- if .Values.externalSecret.enabled }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ .Values.secretName }}
spec:
  refreshInterval: {{ .Values.externalSecret.refreshInterval }}
  secretStoreRef:
    kind: {{ .Values.externalSecret.secretStoreRef.kind }}
    name: {{ .Values.externalSecret.secretStoreRef.name }}
  target:
    name: {{ .Values.secretName }}
    creationPolicy: Owner
    template:
      type: kubernetes.io/tls
      data:
        tls.crt: "{{ `{{ .crt }}` }}"
        tls.key: "{{ `{{ .key }}` }}"
  data:
    - secretKey: crt
      remoteRef:
        key: {{ .Values.externalSecret.secretId }}
        property: {{ .Values.externalSecret.crtKey }}
    - secretKey: key
      remoteRef:
        key: {{ .Values.externalSecret.secretId }}
        property: {{ .Values.externalSecret.keyKey }}
{{- end }}
