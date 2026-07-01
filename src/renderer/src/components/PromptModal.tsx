import React, { useState } from 'react'
import { Modal, Button, Input } from './ui'

export function PromptModal({
  title,
  label,
  placeholder,
  initialValue = '',
  confirmText = 'Confirm',
  note,
  onConfirm,
  onClose
}: {
  title: string
  label: string
  placeholder?: string
  initialValue?: string
  confirmText?: string
  /** optional explanatory text shown under the input */
  note?: React.ReactNode
  onConfirm: (value: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue)
  const submit = (): void => {
    if (!value.trim()) return
    onConfirm(value.trim())
    onClose()
  }
  return (
    <Modal title={title} onClose={onClose}>
      <span className="block text-[12px] text-app-muted mb-1">{label}</span>
      <Input
        autoFocus
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {note && (
        <div className="mt-2 text-[11px] text-app-muted leading-relaxed">{note}</div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={!value.trim()}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}

export function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  danger = false,
  onConfirm,
  onClose
}: {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[13px] text-app-text leading-relaxed whitespace-pre-line">{message}</p>
      <div className="flex justify-end gap-2 mt-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}
