import { Button, ButtonProps } from '@/components/ui/button';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface WriteProtectedButtonProps extends ButtonProps {
  children: React.ReactNode;
}

export function WriteProtectedButton({ children, disabled, ...props }: WriteProtectedButtonProps) {
  const { canWrite, isLocked } = useAppSettings();
  
  const isDisabled = disabled || !canWrite;

  if (isLocked && !disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button {...props} disabled={true}>
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Aplicación en modo solo lectura</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button {...props} disabled={isDisabled}>
      {children}
    </Button>
  );
}
