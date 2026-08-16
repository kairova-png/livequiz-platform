/* Общий тип отправки команд пульта. */

import type { HostCommand } from '../../shared/protocol.ts';

export type Send = (command: HostCommand) => void;
