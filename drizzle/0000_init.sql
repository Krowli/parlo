CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor` text NOT NULL,
	`vendor_session_id` text,
	`parent_id` integer,
	`root_id` integer,
	`depth` integer NOT NULL,
	`cwd` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agents_vendor_session_idx` ON `agents` (`vendor`,`vendor_session_id`);--> statement-breakpoint
CREATE INDEX `agents_parent_idx` ON `agents` (`parent_id`);--> statement-breakpoint
CREATE INDEX `agents_root_idx` ON `agents` (`root_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`from_id` integer NOT NULL,
	`to_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_thread_idx` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_id` integer NOT NULL,
	`colleague_id` integer NOT NULL,
	`access` text NOT NULL,
	`status` text NOT NULL,
	`failure` text,
	`runner_pid` integer,
	`colleague_pid` integer,
	`deadline_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`caller_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`colleague_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `threads_caller_status_idx` ON `threads` (`caller_id`,`status`);--> statement-breakpoint
CREATE INDEX `threads_status_idx` ON `threads` (`status`);