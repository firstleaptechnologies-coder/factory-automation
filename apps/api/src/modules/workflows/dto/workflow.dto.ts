import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StatusCategory, UserRole } from '@prisma/client';
import { HOME_CARD_LIMIT } from '@fas/shared';

/**
 * A set of stages work moves through.
 *
 * Every shop's floor is different and the software follows the floor rather
 * than the other way round. A shop can keep more than one — a flow for
 * furniture and a flow for a glass job do not have the same steps.
 */
export class CreateWorkflowDto {
  /** A short code for it. Fixed once created, because orders refer to it. */
  @IsString() @MinLength(1) code: string;
  /** What the shop calls this flow. */
  @IsString() @MinLength(1) name: string;
  /** What kind of work it is for, so whoever punches knows which to choose. */
  @IsOptional() @IsString() description?: string;
}

/**
 * What can be changed about a flow itself, rather than its stages.
 */
export class UpdateWorkflowDto {
  /** What the shop calls this flow. */
  @IsOptional() @IsString() @MinLength(1) name?: string;
  /** What kind of work it is for. */
  @IsOptional() @IsString() description?: string;
  /**
   * Days an enquiry may sit untouched before it goes quiet. Zero or null turns
   * it off — nothing is ever archived by age.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) leadExpiryDays?: number | null;
  /**
   * The stage an enquiry moves to when a quote is sent. Null means sending one
   * records itself against the enquiry but moves nothing.
   */
  @IsOptional() @IsString() quoteStatusId?: string | null;
  /** Where an enquiry goes when the client turns the quote down. */
  @IsOptional() @IsString() lostStatusId?: string | null;
}

/** One stage in a flow — a column on the board. */
export class StatusDto {
  /** A short code for the stage. Fixed once created; orders sit in it. */
  @IsString() @MinLength(1) code: string;
  /** What the stage is called on the board — "Cutting", "Polish", "QC". */
  @IsString() @MinLength(1) name: string;
  /** Its colour on the board, which is how a floor reads it from a distance. */
  @IsOptional() @IsString() color?: string;
  /**
   * What kind of stage it is — work in progress, waiting, done, lost. It is
   * what lets the product tell "finished" from "abandoned" without knowing
   * what this shop called either.
   */
  @IsOptional() @IsEnum(StatusCategory) category?: StatusCategory;
  /** Parent status, for grouping. Null clears the parent. */
  @IsOptional() @IsString() parentId?: string | null;
  /**
   * Whether new work starts here. A flow needs one, or a punched order has
   * nowhere to land.
   */
  @IsOptional() @IsBoolean() isInitial?: boolean;
  /** Whether work stops here — the stage an order is finished in. */
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  /** Where the stage sits, left to right, on the board. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  /** Where the stage sits on the flow diagram, across. */
  @IsOptional() @Type(() => Number) @IsNumber() canvasX?: number;
  /** Where the stage sits on the flow diagram, down. */
  @IsOptional() @Type(() => Number) @IsNumber() canvasY?: number;
}

export class UpdateStatusDto {
  /** The stage's short code. */
  @IsOptional() @IsString() code?: string;
  /**
   * What the stage is called. Renaming it renames the column; every order
   * sitting in it stays where it is.
   */
  @IsOptional() @IsString() name?: string;
  /** Its colour on the board. */
  @IsOptional() @IsString() color?: string;
  /** What kind of stage it is — in progress, waiting, done, lost. */
  @IsOptional() @IsEnum(StatusCategory) category?: StatusCategory;
  /** Parent status, for grouping. Null clears the parent. */
  @IsOptional() @IsString() parentId?: string | null;
  /** Whether new work starts here. */
  @IsOptional() @IsBoolean() isInitial?: boolean;
  /** Whether work stops here. */
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  /** Where the stage sits, left to right, on the board. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  /** Where the stage sits on the flow diagram, across. */
  @IsOptional() @Type(() => Number) @IsNumber() canvasX?: number;
  /** Where the stage sits on the flow diagram, down. */
  @IsOptional() @Type(() => Number) @IsNumber() canvasY?: number;
}

/**
 * A move the flow allows — one arrow on the diagram.
 *
 * Only the moves drawn here can be made, which is what stops an order jumping
 * from cutting to delivered because somebody tapped the wrong card.
 */
export class TransitionDto {
  /** The stage being moved out of. */
  @IsString() fromStatusId: string;
  /** The stage being moved into. */
  @IsString() toStatusId: string;
  /** What the move is called on the button — "Send to polish", "Reject". */
  @IsOptional() @IsString() label?: string;
  /**
   * Whether a reason must be given. Worth setting on the moves that go
   * backwards or sideways: those are the ones somebody asks about later.
   */
  @IsOptional() @IsBoolean() requiresNote?: boolean;
  /**
   * Who may make this move. Empty means anybody who can move orders at all —
   * used to keep, say, sign-off to a supervisor.
   */
  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true }) allowedRoles?: UserRole[];
}

/** Where one stage was dragged to on the flow diagram. */
export class NodePositionDto {
  /** Which stage. */
  @IsString() id: string;
  /** Its position across the canvas. */
  @Type(() => Number) @IsNumber() canvasX: number;
  /** Its position down the canvas. */
  @Type(() => Number) @IsNumber() canvasY: number;
}

/**
 * What the drag-and-drop canvas sends on save: the whole graph at once.
 *
 * Saving the diagram as a unit rather than one edge at a time keeps the stored
 * flow consistent with what the admin sees — a half-applied set of edits would
 * leave orders in statuses with no way out.
 */
export class SaveGraphDto {
  /** Where every stage sits on the canvas. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodePositionDto)
  positions: NodePositionDto[];

  /** Every move the flow allows, as the diagram now draws them. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransitionDto)
  transitions: TransitionDto[];
}

/**
 * Which stages the home screen counts, in the order they appear there.
 *
 * Five, because the card is read at a glance from across a workshop — a longer
 * list stops being a summary. Which five is the shop's own decision, so it is
 * stored rather than derived from the flow.
 */
export class HomeCardDto {
  /** The stages to count, in the order they appear on the card. */
  @IsArray()
  @ArrayMaxSize(HOME_CARD_LIMIT)
  @IsString({ each: true })
  statusIds: string[];
}
