import React from 'react';
import { IonIcon } from '@ionic/react';
import { useIonRouter } from '@ionic/react';
import './ActionButton.css';

interface Props {
  icon?: string;
  onClick?: () => void;
  routerLink?: string;
  children: React.ReactNode;
  solid?: boolean;
  expand?: boolean;
  disabled?: boolean;
  className?: string;
}

const ActionButton: React.FC<Props> = ({
  icon, onClick, routerLink, children, solid, expand = true, disabled, className,
}) => {
  const router = useIonRouter();

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    if (routerLink) router.push(routerLink);
  };

  return (
    <button
      className={[
        'action-btn',
        solid ? 'action-btn--solid' : '',
        expand ? 'action-btn--expand' : '',
        disabled ? 'action-btn--disabled' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      disabled={disabled}
    >
      {icon && (
        <span className="action-btn__icon">
          <IonIcon icon={icon} />
        </span>
      )}
      {children}
    </button>
  );
};

export default ActionButton;
