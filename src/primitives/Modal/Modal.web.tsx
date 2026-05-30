import React, { useContext, useId } from 'react';
import { WebModalProps } from './types';
import { ModalContainer } from './ModalContainer';
import { ModalCloseContext } from './ModalContainer/ModalContainer.web';
import { Icon } from '../Icon';

const ModalInner: React.FC<{
  title?: React.ReactNode;
  modalTitleId: string;
  size: 'small' | 'medium' | 'large';
  noPadding: boolean;
  className: string;
  hideClose: boolean;
  titleAlign: 'left' | 'center';
  children: React.ReactNode;
}> = ({
  title,
  modalTitleId,
  size,
  noPadding,
  className,
  hideClose,
  titleAlign,
  children,
}) => {
  const close = useContext(ModalCloseContext);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? modalTitleId : undefined}
      className={`quorum-modal text-subtle relative pointer-events-auto quorum-modal-${size} ${noPadding ? 'quorum-modal-no-padding' : ''} ${className}`}
    >
      {!hideClose && (
        <button
          type="button"
          aria-label="Close dialog"
          className="quorum-modal-close select-none cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            // Trigger this modal's animated close. Falls back to dispatching
            // an Escape event only if no context is present (legacy fallback).
            if (close) {
              close();
            } else {
              const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
              document.dispatchEvent(escEvent);
            }
          }}
        >
          <Icon name="close" size="md" />
        </button>
      )}

      {title && (
        <div
          id={modalTitleId}
          className={`quorum-modal-title select-none cursor-default ${titleAlign === 'center' ? 'quorum-modal-title-center' : ''}`}
        >
          {title}
        </div>
      )}

      <div className="quorum-modal-container">{children}</div>
    </div>
  );
};

const Modal: React.FC<WebModalProps> = ({
  title,
  visible,
  onClose,
  hideClose = false,
  children,
  size = 'medium',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className = '',
  noPadding = false,
  titleAlign = 'left',
}) => {
  const modalTitleId = useId();

  return (
    <ModalContainer
      visible={visible}
      onClose={onClose}
      closeOnBackdropClick={closeOnBackdropClick}
      closeOnEscape={closeOnEscape}
      animationDuration={300}
    >
      <ModalInner
        title={title}
        modalTitleId={modalTitleId}
        size={size}
        noPadding={noPadding}
        className={className}
        hideClose={hideClose}
        titleAlign={titleAlign}
      >
        {children}
      </ModalInner>
    </ModalContainer>
  );
};

export default Modal;
