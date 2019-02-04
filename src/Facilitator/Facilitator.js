// Copyright 2019 OpenST Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ----------------------------------------------------------------------------
//
// http://www.simpletoken.org/
//
// ----------------------------------------------------------------------------

const BN = require('bn.js');
const Web3 = require('web3');
const EIP20Gateway = require('../../src/ContractInteract/EIP20Gateway');
const EIP20CoGateway = require('../../src/ContractInteract/EIP20CoGateway');
const Utils = require('../utils/Utils');
const ProofUtils = require('../utils/ProofUtils');
const Message = require('../../src/utils/Message');
const Logger = require('../../logger/Logger');

const logger = new Logger('facilitator');
const MessageStatus = Message.messageStatus();

/**
 * Class to facilitate stake and mint.
 */
class Facilitator {
  /**
   * Constructor for facilitator.
   *
   * @param {Object} originWeb3 Origin chain web3 object.
   * @param {Object} auxiliaryWeb3 Auxiliary chain web3 object.
   * @param {string} Gateway contract address.
   * @param {string} CoGateway contract address.
   */
  constructor(originWeb3, auxiliaryWeb3, gatewayAddress, coGatewayAddress) {
    if (!(originWeb3 instanceof Web3)) {
      const err = new TypeError('Invalid origin web3 object.');
      throw err;
    }
    if (!(auxiliaryWeb3 instanceof Web3)) {
      const err = new TypeError('Invalid auxiliary web3 object.');
      throw err;
    }
    if (!Web3.utils.isAddress(gatewayAddress)) {
      const err = new TypeError('Invalid Gateway address.');
      throw err;
    }
    if (!Web3.utils.isAddress(coGatewayAddress)) {
      const err = new TypeError('Invalid CoGateway address.');
      throw err;
    }

    this.originWeb3 = originWeb3;
    this.auxiliaryWeb3 = auxiliaryWeb3;
    this.gateway = new EIP20Gateway(originWeb3, gatewayAddress);
    this.coGateway = new EIP20CoGateway(auxiliaryWeb3, coGatewayAddress);

    this.stake = this.stake.bind(this);
    this.progressStake = this.progressStake.bind(this);
    this.confirmStakeIntent = this.confirmStakeIntent.bind(this);
    this.getProof = this.getProof.bind(this);
  }

  /**
   * Performs the stake process.
   *
   * @param {string} staker Staker address.
   * @param {string} amount Stake amount.
   * @param {string} beneficiary Beneficiary address for minting tokens.
   * @param {string} gasPrice Gas price for reward calculation.
   * @param {string} gasLimit Maximum gas for reward calculation.
   * @param {string} hashLock Hash lock.
   * @param {Object} txOption Transaction options.
   *
   * @returns {Promise} Promise object.
   */
  stake(staker, amount, beneficiary, gasPrice, gasLimit, hashLock, txOption) {
    return new Promise(async (onResolve, onReject) => {
      logger.info('Stake');
      logger.info('-----------------------');
      if (!Web3.utils.isAddress(staker)) {
        const err = new TypeError('Invalid staker address.');
        onReject(err);
      }

      if (new BN(amount).eqn(0)) {
        const err = new TypeError('Stake amount must not be zero.');
        onReject(err);
      }

      if (!Web3.utils.isAddress(beneficiary)) {
        const err = new TypeError('Invalid beneficiary address.');
        onReject(err);
      }

      if (gasPrice === undefined) {
        const err = new TypeError('Invalid gas price.');
        onReject(err);
      }

      if (gasLimit === undefined) {
        const err = new TypeError('Invalid gas limit.');
        onReject(err);
      }

      if (!txOption) {
        const err = new TypeError('Invalid transaction options.');
        onReject(err);
      }

      if (!Web3.utils.isAddress(txOption.from)) {
        const err = new TypeError('Invalid facilitator address.');
        onReject(err);
      }

      let stakeHashLock = hashLock;
      if (hashLock === undefined) {
        logger.info('* Generating hash lock and unlock secret *');
        const hashLockObj = await this.getHashLock();
        stakeHashLock = hashLockObj.hashLock;
        logger.info(`  - hash lock generated is ${stakeHashLock}`);
        logger.info(
          `  - unlock secrete generated is ${hashLockObj.unlockSecret}`,
        );
      }

      const facilitatorAddress = txOption.from;

      logger.info(
        '* Checking if staker has approved gateway for token transfer *',
      );
      const isStakeAmountApproved = await this.gateway.isStakeAmountApproved(
        staker,
        amount,
      );

      logger.info(`  - Approval status is ${isStakeAmountApproved}`);

      if (!isStakeAmountApproved) {
        if (staker === facilitatorAddress) {
          logger.info(
            '  - As staker is facilitator, approving gateway for token transfer',
          );
          await this.gateway
            .approveStakeAmount(amount, txOption)
            .catch((exception) => {
              logger.info(
                '  - Failed to approve gateway contract for token transfer',
              );
              onReject(exception);
            });
        } else {
          logger.info('  - Cannot perform stake.');
          const err = new TypeError(
            'Transfer of stake amount must be approved.',
          );
          onReject(err);
        }
      }

      logger.info(
        '* Checking if facilitator has approved gateway for bounty token transfer *',
      );
      const isBountyAmountApproved = await this.gateway.isBountyAmountApproved(
        facilitatorAddress,
      );
      logger.info(`  - Approval status is ${isBountyAmountApproved}`);

      if (!isBountyAmountApproved) {
        logger.info('  - Approving gateway contract for bounty transfer');
        await this.gateway.approveBountyAmount(txOption).catch((exception) => {
          logger.info(
            '  - Failed to approve gateway contract for bounty transfer',
          );
          onReject(exception);
        });
      }

      logger.info('* Getting nonce for the staker account *');
      const nonce = await this.gateway.getNonce(staker).catch((exception) => {
        logger.info('  - Failed to get staker nonce');
        onReject(exception);
      });
      logger.info(`  - Staker's nonce is ${nonce}`);

      logger.info('* Performing stake *');
      this.gateway
        .stake(
          amount,
          beneficiary,
          gasPrice,
          gasLimit,
          nonce,
          hashLock,
          txOption,
        )
        .then((stakeResult) => {
          logger.info('  - Succcessfully performed stake.');
          onResolve(stakeResult);
        })
        .catch((exception) => {
          logger.info('  - Failed to performed stake.');
          onReject(exception);
        });
    });
  }

  /**
   * Performs the progress stake and progress mint.
   *
   * @param {string} staker Staker address.
   * @param {string} amount Stake amount.
   * @param {string} beneficiary Beneficiary address for minting tokens.
   * @param {string} gasPrice Gas price for reward calculation.
   * @param {string} gasLimit Maximum gas for reward calculation.
   * @param {string} nonce Stake nonce.
   * @param {string} hashLock Hash lock.
   * @param {string} unlockSecret Unlock secret.
   * @param {Object} txOptionOrigin Transaction options for origin chain.
   * @param {Object} txOptionAuxiliary Transaction options for auxiliary chain.
   *
   * @returns {Promise} Promise object.
   */
  progressStake(
    staker,
    amount,
    beneficiary,
    gasPrice,
    gasLimit,
    nonce,
    hashLock,
    unlockSecret,
    txOptionOrigin,
    txOptionAuxiliary,
  ) {
    return new Promise((onResolve, onReject) => {
      logger.info('Performing stake and mint');
      logger.info('-----------------------');
      if (!Web3.utils.isAddress(staker)) {
        const err = new TypeError('Invalid staker address.');
        onReject(err);
      }

      if (new BN(amount).eqn(0)) {
        const err = new TypeError('Stake amount must not be zero.');
        onReject(err);
      }

      if (!Web3.utils.isAddress(beneficiary)) {
        const err = new TypeError('Invalid beneficiary address.');
        onReject(err);
      }

      if (gasPrice === undefined) {
        const err = new TypeError('Invalid gas price.');
        onReject(err);
      }

      if (gasLimit === undefined) {
        const err = new TypeError('Invalid gas limit.');
        onReject(err);
      }

      if (nonce === undefined) {
        const err = new TypeError('Invalid staker nonce.');
        onReject(err);
      }

      if (!txOptionOrigin) {
        const err = new TypeError(
          'Invalid transaction options for origin chain.',
        );
        onReject(err);
      }

      if (!txOptionAuxiliary) {
        const err = new TypeError(
          'Invalid transaction options for auxiliary chain.',
        );
        onReject(err);
      }

      if (!Web3.utils.isAddress(txOptionOrigin.from)) {
        const err = new TypeError('Invalid origin chain facilitator address.');
        onReject(err);
      }

      if (!Web3.utils.isAddress(txOptionAuxiliary.from)) {
        const err = new TypeError(
          'Invalid auxiliary chain facilitator address.',
        );
        onReject(err);
      }

      this.confirmStakeIntent(
        staker,
        amount,
        beneficiary,
        gasPrice,
        gasLimit,
        nonce,
        hashLock,
        unlockSecret,
        txOptionAuxiliary,
      )
        .then(() => {
          const messageHash = Message.getStakeMessageHash(
            amount,
            beneficiary,
            this.gateway.gatewayAddress,
            nonce,
            gasPrice,
            gasLimit,
            staker,
            hashLock,
          );

          this.performProgress(
            messageHash,
            unlockSecret,
            txOptionOrigin,
            txOptionAuxiliary,
          )
            .then(() => {
              onResolve(true);
            })
            .catch((exception) => {
              onReject(exception);
            });
        })
        .catch((exception) => {
          logger.info('  - Confirm stake intent failed');
          onReject(exception);
        });
    });
  }

  /**
   * Performs confirm stake intent.
   *
   * @param {string} staker Staker address.
   * @param {string} amount Stake amount.
   * @param {string} beneficiary Beneficiary address for minting tokens.
   * @param {string} gasPrice Gas price for reward calculation.
   * @param {string} gasLimit Maximum gas for reward calculation.
   * @param {string} nonce Stake nonce.
   * @param {string} hashLock Hash lock.
   * @param {string} unlockSecret Unlock secret.
   * @param {Object} txOptions Transaction options.
   *
   * @returns {Promise} Promise object.
   */
  confirmStakeIntent(
    staker,
    amount,
    beneficiary,
    gasPrice,
    gasLimit,
    nonce,
    hashLock,
    unlockSecret,
    txOptions,
  ) {
    return new Promise(async (onResolve, onReject) => {
      logger.info('Confirming stake intent');
      logger.info('-----------------------');
      if (!Web3.utils.isAddress(staker)) {
        const err = new TypeError('Invalid staker address.');
        onReject(err);
      }
      if (new BN(amount).eqn(0)) {
        const err = new TypeError('Stake amount must not be zero.');
        onReject(err);
      }
      if (!Web3.utils.isAddress(beneficiary)) {
        const err = new TypeError('Invalid beneficiary address.');
        onReject(err);
      }
      if (typeof gasPrice !== 'string') {
        const err = new TypeError('Invalid gas price.');
        onReject(err);
      }
      if (typeof gasLimit !== 'string') {
        const err = new TypeError('Invalid gas limit.');
        onReject(err);
      }
      if (typeof nonce !== 'string') {
        const err = new TypeError('Invalid staker nonce.');
        onReject(err);
      }
      if (!txOptions) {
        const err = new TypeError('Invalid transaction options.');
        onReject(err);
      }
      if (!Web3.utils.isAddress(txOptions.from)) {
        const err = new TypeError('Invalid facilitator address.');
        onReject(err);
      }

      logger.info('* Generating message hash with given stake parameters *');
      const messageHash = Message.getStakeMessageHash(
        amount,
        beneficiary,
        this.gateway.gatewayAddress,
        nonce,
        gasPrice,
        gasLimit,
        staker,
        hashLock,
      );

      logger.info(`  - Message hash is ${messageHash}`);

      const stakeMessageStatus = await this.gateway.getOutboxMessageStatus(
        messageHash,
      );

      logger.info(
        `  - Gateway's outbox message hash is ${stakeMessageStatus}`,
      );

      if (stakeMessageStatus === MessageStatus.UNDECLARED) {
        const err = new TypeError('Stake message hash must be declared.');
        onReject(err);
      }

      const mintMessageStatus = await this.coGateway.getInboxMessageStatus(
        messageHash,
      );

      logger.info(
        `  - CoGateway's inbox message hash is ${mintMessageStatus}`,
      );

      if (
        mintMessageStatus === MessageStatus.DECLARED ||
        mintMessageStatus === MessageStatus.PROGRESSED ||
        mintMessageStatus === MessageStatus.REVOKED
      ) {
        logger.info('  - Stake intent already confirmed on CoGateway');
        onResolve(true);
      } else {
        this.getProof(messageHash, stakeMessageStatus)
          .then(async (proofData) => {
            logger.info('* Proving Gateway account on CoGateway *');

            await this.coGateway
              .proveGateway(
                proofData.blockNumber,
                proofData.accountData,
                proofData.accountProof,
                txOptions,
              )
              .then(() => {
                logger.info('  - Gateway was proven on CoGateway');
                this.coGateway
                  .confirmStakeIntent(
                    staker,
                    nonce,
                    beneficiary,
                    amount,
                    gasPrice,
                    gasLimit,
                    hashLock,
                    proofData.blockNumber,
                    proofData.storageProof,
                    txOptions,
                  )
                  .then((confirmStakeIntentResult) => {
                    logger.info('  - Confirm stake intent successful');
                    onResolve(confirmStakeIntentResult);
                  })
                  .catch((exception) => {
                    onReject(exception);
                  });
              })
              .catch((exception) => {
                logger.info(
                  '  - Failed to prove gateway account on CoGateway',
                );
                onReject(exception);
              });
          })
          .catch((exception) => {
            onReject(exception);
          });
      }
    });
  }

  /**
   * Performs progress stake and progress mint.
   *
   * @param {string} messageHash Message hash.
   * @param {string} unlockSecret Unlock secret for progress stake.
   * @param {Object} txOptionOrigin Transaction options for origin chain.
   * @param {Object} txOptionAuxiliary Transaction options for auxiliary chain.
   *
   * @returns {Promise} Promise object.
   */
  async performProgress(
    messageHash,
    unlockSecret,
    txOptionOrigin,
    txOptionAuxiliary,
  ) {
    return new Promise((onResolve, onReject) => {
      logger.info('Performing progress stake and progress mint');
      logger.info('-----------------------');
      if (typeof messageHash !== 'string') {
        const err = new TypeError('Invalid message hash.');
        onReject(err);
      }
      if (typeof unlockSecret !== 'string') {
        const err = new TypeError('Invalid unlock secret.');
        onReject(err);
      }
      if (txOptionOrigin === undefined) {
        const err = new TypeError('Invalid origin transaction option.');
        onReject(err);
      }
      if (txOptionAuxiliary === undefined) {
        const err = new TypeError('Invalid auxiliary transaction option.');
        onReject(err);
      }

      Promise.all([
        this.performProgressStake(messageHash, unlockSecret, txOptionOrigin),
        this.performProgressMint(messageHash, unlockSecret, txOptionAuxiliary),
      ])
        .then(() => {
          onResolve(true);
        })
        .catch((exception) => {
          onReject(exception);
        });
    });
  }

  /**
   * Performs progress stake.
   *
   * @param {string} messageHash Message hash.
   * @param {string} unlockSecret Unlock secret for progress stake.
   * @param {Object} txOption Transaction options.
   *
   * @returns {Promise} Promise object.
   */
  performProgressStake(messageHash, unlockSecret, txOption) {
    return new Promise(async (onResolve, onReject) => {
      if (typeof messageHash !== 'string') {
        const err = new TypeError('Invalid message hash.');
        onReject(err);
      }
      if (typeof unlockSecret !== 'string') {
        const err = new TypeError('Invalid unlock secret.');
        onReject(err);
      }
      if (txOption === undefined) {
        const err = new TypeError('Invalid transaction option.');
        onReject(err);
      }

      const stakeMessageStatus = await this.gateway.getOutboxMessageStatus(
        messageHash,
      );
      logger.info(
        `  - Gateway's outbox message status is ${stakeMessageStatus}`,
      );

      if (
        stakeMessageStatus === MessageStatus.UNDECLARED ||
        stakeMessageStatus === MessageStatus.REVOCATION_DECLARED ||
        stakeMessageStatus === MessageStatus.REVOKED
      ) {
        logger.info('  - Cannot perform progress stake.');
        const err = TypeError('Message cannot be progressed.');
        onReject(err);
      } else if (stakeMessageStatus === MessageStatus.PROGRESSED) {
        logger.info('  - Progress stake is already done.');
        onResolve(true);
      } else {
        this.gateway
          .progressStake(messageHash, unlockSecret, txOption)
          .then((progressStakeResult) => {
            logger.info('  - Progress stake successful.');
            onResolve(progressStakeResult);
          })
          .catch((exception) => {
            logger.info('  - Failed to progress stake.');
            onReject(exception);
          });
      }
    });
  }

  /**
   * Performs progress mint.
   *
   * @param {string} messageHash Message hash.
   * @param {string} unlockSecret Unlock secret for progress stake.
   * @param {Object} txOption Transaction options.
   *
   * @returns {Promise} Promise object.
   */
  async performProgressMint(messageHash, unlockSecret, txOption) {
    return new Promise(async (onResolve, onReject) => {
      if (typeof messageHash !== 'string') {
        const err = new TypeError('Invalid message hash.');
        onReject(err);
      }
      if (typeof unlockSecret !== 'string') {
        const err = new TypeError('Invalid unlock secret.');
        onReject(err);
      }
      if (txOption === undefined) {
        const err = new TypeError('Invalid transaction option.');
        onReject(err);
      }

      const mintMessageStatus = await this.coGateway.getInboxMessageStatus(
        messageHash,
      );
      logger.info(
        `  - CoGateway's inbox message status is ${mintMessageStatus}`,
      );
      if (
        mintMessageStatus === MessageStatus.UNDECLARED ||
        mintMessageStatus === MessageStatus.REVOKED ||
        mintMessageStatus === MessageStatus.REVOCATION_DECLARED
      ) {
        logger.info('  - Cannot perform progress mint.');
        const err = new TypeError('Message cannot be progressed.');
        onResolve(err);
      } else if (mintMessageStatus === MessageStatus.PROGRESSED) {
        logger.info('  - Progress mint is already done.');
        onResolve(true);
      } else {
        this.coGateway
          .progressMint(messageHash, unlockSecret, txOption)
          .then((progressMintResult) => {
            logger.info('  - Progress mint successful.');
            onResolve(progressMintResult);
          })
          .catch((exception) => {
            logger.info('  - Failed to progress mint.');
            onReject(exception);
          });
      }
    });
  }

  /**
   * Gets the proof and validates it.
   *
   * @param {string} messageHash Message hash.
   * @param {MessageStatus} status Message status.
   *
   * @returns {Object} Proof data.
   */
  getProof(messageHash, messageStatus) {
    return new Promise(async (onResolve, onReject) => {
      logger.info('* Generating proof data *');

      const latestAnchorInfo = await this.coGateway.getLatestAnchorInfo();

      logger.info(
        `  - Last committed block height is ${latestAnchorInfo.blockHeight}`,
      );
      logger.info(
        `  - Last committed state root is ${latestAnchorInfo.stateRoot}`,
      );

      const proofUtils = new ProofUtils(this.originWeb3, this.auxiliaryWeb3);
      const blockHeight = `0x${new BN(latestAnchorInfo.blockHeight).toString(
        16,
      )}`;

      logger.info('  - Attempting to generate proof');

      proofUtils
        .getOutboxProof(
          this.gateway.gatewayAddress,
          [messageHash],
          blockHeight,
        )
        .then((proof) => {
          // TODO: validate proofdata for the status and gateway address.
          logger.info('  - Proof generation successful');
          onResolve({
            accountData: proof.encodedAccountValue,
            accountProof: proof.serializedAccountProof,
            storageProof: proof.storageProof[0].serializedProof,
            blockNumber: latestAnchorInfo.blockHeight,
            stateRoot: latestAnchorInfo.stateRoot,
          });
        })
        .catch((exception) => {
          logger.info('  - Failed to generate proof');
          onReject(exception);
        });
    });
  }

  /**
   * Helper function to generate hash lock and unlock secrete. If unlock secret
   * is provided then it will generate the hash lock.
   *
   * @param {string} unlockSecret Unlock secret.
   *
   * @returns {Object} An object containing hash lock and unlock secret.
   */
  getHashLock(unlockSecret) {
    let hashLock = {};

    if (unlockSecret === undefined) {
      hashLock = Utils.createSecretHashLock();
    } else {
      hashLock = Utils.toHashLock(unlockSecret);
    }

    return hashLock;
  }
}

module.exports = Facilitator;
