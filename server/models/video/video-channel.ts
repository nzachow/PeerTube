import * as Sequelize from 'sequelize'
import { isVideoChannelDescriptionValid, isVideoChannelNameValid } from '../../helpers'
import { CONSTRAINTS_FIELDS } from '../../initializers/constants'
import { sendDeleteVideoChannel } from '../../lib/activitypub/send/send-delete'

import { addMethodsToModel, getSort } from '../utils'
import { VideoChannelAttributes, VideoChannelInstance, VideoChannelMethods } from './video-channel-interface'
import { getAnnounceActivityPubUrl } from '../../lib/activitypub/url'
import { activityPubCollection } from '../../helpers/activitypub'
import { isActivityPubUrlValid } from '../../helpers/custom-validators/activitypub/misc'

let VideoChannel: Sequelize.Model<VideoChannelInstance, VideoChannelAttributes>
let toFormattedJSON: VideoChannelMethods.ToFormattedJSON
let toActivityPubObject: VideoChannelMethods.ToActivityPubObject
let isOwned: VideoChannelMethods.IsOwned
let countByAccount: VideoChannelMethods.CountByAccount
let listForApi: VideoChannelMethods.ListForApi
let listByAccount: VideoChannelMethods.ListByAccount
let loadByIdAndAccount: VideoChannelMethods.LoadByIdAndAccount
let loadByUUID: VideoChannelMethods.LoadByUUID
let loadAndPopulateAccount: VideoChannelMethods.LoadAndPopulateAccount
let loadByUUIDAndPopulateAccount: VideoChannelMethods.LoadByUUIDAndPopulateAccount
let loadByHostAndUUID: VideoChannelMethods.LoadByHostAndUUID
let loadAndPopulateAccountAndVideos: VideoChannelMethods.LoadAndPopulateAccountAndVideos
let loadByUrl: VideoChannelMethods.LoadByUrl
let loadByUUIDOrUrl: VideoChannelMethods.LoadByUUIDOrUrl

export default function (sequelize: Sequelize.Sequelize, DataTypes: Sequelize.DataTypes) {
  VideoChannel = sequelize.define<VideoChannelInstance, VideoChannelAttributes>('VideoChannel',
    {
      uuid: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        validate: {
          isUUID: 4
        }
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          nameValid: value => {
            const res = isVideoChannelNameValid(value)
            if (res === false) throw new Error('Video channel name is not valid.')
          }
        }
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          descriptionValid: value => {
            const res = isVideoChannelDescriptionValid(value)
            if (res === false) throw new Error('Video channel description is not valid.')
          }
        }
      },
      remote: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      url: {
        type: DataTypes.STRING(CONSTRAINTS_FIELDS.VIDEO_CHANNELS.URL.max),
        allowNull: false,
        validate: {
          urlValid: value => {
            const res = isActivityPubUrlValid(value)
            if (res === false) throw new Error('Video channel URL is not valid.')
          }
        }
      }
    },
    {
      indexes: [
        {
          fields: [ 'accountId' ]
        }
      ],
      hooks: {
        afterDestroy
      }
    }
  )

  const classMethods = [
    associate,

    listForApi,
    listByAccount,
    loadByIdAndAccount,
    loadAndPopulateAccount,
    loadByUUIDAndPopulateAccount,
    loadByUUID,
    loadByHostAndUUID,
    loadAndPopulateAccountAndVideos,
    countByAccount,
    loadByUrl,
    loadByUUIDOrUrl
  ]
  const instanceMethods = [
    isOwned,
    toFormattedJSON,
    toActivityPubObject
  ]
  addMethodsToModel(VideoChannel, classMethods, instanceMethods)

  return VideoChannel
}

// ------------------------------ METHODS ------------------------------

isOwned = function (this: VideoChannelInstance) {
  return this.remote === false
}

toFormattedJSON = function (this: VideoChannelInstance) {
  const json = {
    id: this.id,
    uuid: this.uuid,
    name: this.name,
    description: this.description,
    isLocal: this.isOwned(),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  }

  if (this.Account !== undefined) {
    json['owner'] = {
      name: this.Account.name,
      uuid: this.Account.uuid
    }
  }

  if (Array.isArray(this.Videos)) {
    json['videos'] = this.Videos.map(v => v.toFormattedJSON())
  }

  return json
}

toActivityPubObject = function (this: VideoChannelInstance) {
  let sharesObject
  if (Array.isArray(this.VideoChannelShares)) {
    const shares: string[] = []

    for (const videoChannelShare of this.VideoChannelShares) {
      const shareUrl = getAnnounceActivityPubUrl(this.url, videoChannelShare.Account)
      shares.push(shareUrl)
    }

    sharesObject = activityPubCollection(shares)
  }

  const json = {
    type: 'VideoChannel' as 'VideoChannel',
    id: this.url,
    uuid: this.uuid,
    content: this.description,
    name: this.name,
    published: this.createdAt.toISOString(),
    updated: this.updatedAt.toISOString(),
    shares: sharesObject
  }

  return json
}

// ------------------------------ STATICS ------------------------------

function associate (models) {
  VideoChannel.belongsTo(models.Account, {
    foreignKey: {
      name: 'accountId',
      allowNull: false
    },
    onDelete: 'CASCADE'
  })

  VideoChannel.hasMany(models.Video, {
    foreignKey: {
      name: 'channelId',
      allowNull: false
    },
    onDelete: 'CASCADE'
  })
}

function afterDestroy (videoChannel: VideoChannelInstance) {
  if (videoChannel.isOwned()) {
    return sendDeleteVideoChannel(videoChannel, undefined)
  }

  return undefined
}

countByAccount = function (accountId: number) {
  const query = {
    where: {
      accountId
    }
  }

  return VideoChannel.count(query)
}

listForApi = function (start: number, count: number, sort: string) {
  const query = {
    offset: start,
    limit: count,
    order: [ getSort(sort) ],
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        required: true,
        include: [ { model: VideoChannel['sequelize'].models.Server, required: false } ]
      }
    ]
  }

  return VideoChannel.findAndCountAll(query).then(({ rows, count }) => {
    return { total: count, data: rows }
  })
}

listByAccount = function (accountId: number) {
  const query = {
    order: [ getSort('createdAt') ],
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        where: {
          id: accountId
        },
        required: true,
        include: [ { model: VideoChannel['sequelize'].models.Server, required: false } ]
      }
    ]
  }

  return VideoChannel.findAndCountAll(query).then(({ rows, count }) => {
    return { total: count, data: rows }
  })
}

loadByUUID = function (uuid: string, t?: Sequelize.Transaction) {
  const query: Sequelize.FindOptions<VideoChannelAttributes> = {
    where: {
      uuid
    }
  }

  if (t !== undefined) query.transaction = t

  return VideoChannel.findOne(query)
}

loadByUrl = function (url: string, t?: Sequelize.Transaction) {
  const query: Sequelize.FindOptions<VideoChannelAttributes> = {
    where: {
      url
    },
    include: [ VideoChannel['sequelize'].models.Account ]
  }

  if (t !== undefined) query.transaction = t

  return VideoChannel.findOne(query)
}

loadByUUIDOrUrl = function (uuid: string, url: string, t?: Sequelize.Transaction) {
  const query: Sequelize.FindOptions<VideoChannelAttributes> = {
    where: {
      [Sequelize.Op.or]: [
        { uuid },
        { url }
      ]
    }
  }

  if (t !== undefined) query.transaction = t

  return VideoChannel.findOne(query)
}

loadByHostAndUUID = function (fromHost: string, uuid: string, t?: Sequelize.Transaction) {
  const query: Sequelize.FindOptions<VideoChannelAttributes> = {
    where: {
      uuid
    },
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        include: [
          {
            model: VideoChannel['sequelize'].models.Server,
            required: true,
            where: {
              host: fromHost
            }
          }
        ]
      }
    ]
  }

  if (t !== undefined) query.transaction = t

  return VideoChannel.findOne(query)
}

loadByIdAndAccount = function (id: number, accountId: number) {
  const options = {
    where: {
      id,
      accountId
    },
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        include: [ { model: VideoChannel['sequelize'].models.Server, required: false } ]
      }
    ]
  }

  return VideoChannel.findOne(options)
}

loadAndPopulateAccount = function (id: number) {
  const options = {
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        include: [ { model: VideoChannel['sequelize'].models.Server, required: false } ]
      }
    ]
  }

  return VideoChannel.findById(id, options)
}

loadByUUIDAndPopulateAccount = function (uuid: string) {
  const options = {
    where: {
      uuid
    },
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        include: [ { model: VideoChannel['sequelize'].models.Server, required: false } ]
      }
    ]
  }

  return VideoChannel.findOne(options)
}

loadAndPopulateAccountAndVideos = function (id: number) {
  const options = {
    include: [
      {
        model: VideoChannel['sequelize'].models.Account,
        include: [ { model: VideoChannel['sequelize'].models.Server, required: false } ]
      },
      VideoChannel['sequelize'].models.Video
    ]
  }

  return VideoChannel.findById(id, options)
}
