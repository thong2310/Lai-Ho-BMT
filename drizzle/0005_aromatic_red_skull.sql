CREATE TABLE `payment_events` (
	`eventId` varchar(255) NOT NULL,
	`provider` varchar(32) NOT NULL,
	`type` varchar(128) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_events_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `ride_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`customerId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'VND',
	`status` enum('unpaid','creating','pending','paid','failed','expired') NOT NULL DEFAULT 'unpaid',
	`attempt` int NOT NULL DEFAULT 1,
	`sessionRef` varchar(100),
	`providerTransactionId` varchar(255),
	`checkoutUrl` varchar(2048),
	`returnOrigin` varchar(512),
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`paidAt` timestamp,
	CONSTRAINT `ride_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `ride_payments_rideId_unique` UNIQUE(`rideId`),
	CONSTRAINT `ride_payments_sessionRef_unique` UNIQUE(`sessionRef`)
);
